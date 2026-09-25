import type { SupabaseClient } from "@supabase/supabase-js";
import { replyToLine } from "@/lib/line/replyMessage";
import { parseOrderMessage } from "@/lib/line/parseOrderMessage";
import { parseConfirmationCommand, parsePriceArgument } from "@/lib/line/parseConfirmationCommand";
import { matchProduct } from "@/lib/orders/matchProduct";
import { extractCustomer } from "@/lib/orders/extractCustomer";
import { searchSimilarProducts } from "@/lib/orders/similarProducts";
import {
  getActivePendingConfirmation,
  createPendingConfirmation,
  consumePendingConfirmation,
  type PendingConfirmationRecord,
} from "@/lib/orders/pendingConfirmation";
import { listProducts, createProduct } from "@/lib/products/products";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";
import { getOrderByNumber } from "@/lib/orders/getOrderByNumber";
import { updateOrderStatus } from "@/lib/orders/updateOrderStatus";
import { createOrder } from "@/lib/orders/createOrder";
import { getDailySummary } from "@/lib/orders/getDailySummary";
import { statusFromCode } from "@/lib/orders/status";
import {
  buildOrderSummaryReply,
  buildInvalidOrderFormatReply,
  buildOrderNotFoundReply,
  buildInvalidStatusCodeReply,
  buildProductNotFoundReply,
  buildAmbiguousProductReply,
  buildAmbiguousQuantityReply,
  buildInvalidQuantityReply,
  buildDailySummaryReply,
  buildSimilarProductSingleReply,
  buildSimilarProductMultipleReply,
  buildNoSimilarProductReply,
  buildNoPendingConfirmationReply,
  buildInvalidSelectionReply,
  buildInvalidPriceReply,
} from "@/lib/line/buildReplyText";

export interface LineEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source?: { groupId?: string; userId?: string; type?: string };
  message?: { type: string; text?: string };
}

/**
 * Inserts the event id into line_events. Returns true if this is the first
 * time we've seen it (safe to process), false if it's a duplicate delivery.
 */
export async function recordEventOnce(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string
): Promise<boolean> {
  const { error } = await supabase.from("line_events").insert({
    event_id: eventId,
    event_type: eventType,
  });

  if (!error) return true;

  // Postgres unique_violation code
  if (error.code === "23505") return false;

  throw new Error(`Failed to record LINE event ${eventId}: ${error.message}`);
}

export async function handleEvent(
  event: LineEvent,
  supabase: SupabaseClient,
  channelAccessToken: string
): Promise<{ replied: boolean; replyText?: string }> {
  if (event.type !== "message" || event.message?.type !== "text") {
    return { replied: false }; // LINE requires 200 OK regardless; nothing to do for non-text events.
  }

  const isNew = await recordEventOnce(supabase, event.webhookEventId, "message");
  if (!isNew) {
    return { replied: false }; // duplicate delivery of an already-processed event — skip.
  }

  const text = event.message.text ?? "";
  const groupId = event.source?.groupId ?? "";
  const userId = event.source?.userId ?? null;

  if (!event.replyToken) {
    return { replied: false }; // nothing we can reply to
  }

  // Pending-confirmation replies (ใช่ / เลือก N / สร้าง <price>) are checked
  // BEFORE the existing "!"-prefixed command parsing. They intentionally
  // don't use "!" (see parseConfirmationCommand.ts), which is safe because
  // they only ever do anything when an active pending confirmation already
  // exists for this (group, user) scope -- otherwise they fall straight
  // through to today's unchanged "not_a_command" handling below.
  const confirmationCommand = parseConfirmationCommand(text);
  if (confirmationCommand) {
    const replyText = await handlePendingConfirmationReply(
      supabase,
      groupId,
      userId,
      confirmationCommand
    );
    if (replyText !== null) {
      await replyToLine(event.replyToken, replyText, channelAccessToken);
      return { replied: true, replyText };
    }
    // No pending confirmation existed and the text also isn't a valid
    // order/status/summary command -- fall through exactly as an ordinary
    // unrecognized message would (no reply), since e.g. a bare "ใช่" said
    // casually in chat with nothing pending should stay silent.
  }

  const command = parseOrderMessage(text);

  if (command.kind === "not_a_command") {
    return { replied: false }; // ordinary group chat message, not addressed to the bot
  }

  let replyText: string;

  switch (command.kind) {
    case "new_order_tokens": {
      // Stage 2: resolve the product against the active catalog.
      const activeProducts = await listProducts(supabase);
      const match = matchProduct(command.tokens, command.qtyIndex, activeProducts);

      if (!match.matched) {
        if (match.reason === "ambiguous") {
          // Existing Damerau-Levenshtein <= 1 ambiguity -- unchanged.
          replyText = buildAmbiguousProductReply(match.candidates);
          break;
        }

        // Existing exact + distance<=1 passes found nothing. Only now does
        // the NEW similarity tier run, per the approved matching order.
        const attemptedName = command.tokens.slice(0, command.qtyIndex).join(" ");
        // The entire pre-quantity span is the attempted product text here
        // (nothing matched at any prefix length), so it is excluded in
        // full -- passing qtyIndex (not 0) as the "consumed" count.
        const customerForPending = extractCustomer(command.tokens, command.qtyIndex, command.qtyIndex, "");
        const similar = searchSimilarProducts(attemptedName, activeProducts);

        if (similar.kind === "none") {
          await createPendingConfirmation(supabase, {
            groupId,
            userId,
            mode: "create",
            rawQuery: attemptedName,
            candidates: [],
            quantity: command.quantity,
            customerName: customerForPending,
          });
          replyText = buildNoSimilarProductReply(attemptedName);
        } else if (similar.kind === "single") {
          await createPendingConfirmation(supabase, {
            groupId,
            userId,
            mode: "confirm",
            rawQuery: attemptedName,
            candidates: [{ id: similar.product.id, name: similar.product.name }],
            quantity: command.quantity,
            customerName: customerForPending,
          });
          replyText = buildSimilarProductSingleReply(attemptedName, similar.product.name);
        } else {
          await createPendingConfirmation(supabase, {
            groupId,
            userId,
            mode: "select",
            rawQuery: attemptedName,
            candidates: similar.candidates.map((p) => ({ id: p.id, name: p.name })),
            quantity: command.quantity,
            customerName: customerForPending,
          });
          replyText = buildSimilarProductMultipleReply(
            attemptedName,
            similar.candidates.map((p) => p.name)
          );
        }
        break;
      }

      // Stage 3: everything else is customer text, minus one unit token.
      const customer = extractCustomer(
        command.tokens,
        command.qtyIndex,
        match.consumedCount,
        match.product.unit
      );

      const order = await createOrder(supabase, {
        product: match.product,
        quantity: command.quantity,
        customer,
        lineGroupId: groupId || null,
      });
      replyText = buildOrderSummaryReply(order, match.product.unit);
      break;
    }

    case "order_lookup": {
      const order = await getOrderByNumber(supabase, command.orderNumber);
      replyText = order
        ? buildOrderSummaryReply(order)
        : buildOrderNotFoundReply(command.orderNumber);
      break;
    }

    case "order_status_change": {
      const existing = await getOrderByNumber(supabase, command.orderNumber);
      if (!existing) {
        replyText = buildOrderNotFoundReply(command.orderNumber);
        break;
      }
      const newStatus = statusFromCode(command.statusCode);
      if (!newStatus) {
        replyText = buildInvalidStatusCodeReply();
        break;
      }
      const updated = await updateOrderStatus(supabase, command.orderNumber, newStatus);
      replyText = buildOrderSummaryReply(updated);
      break;
    }

    case "summary": {
      const summary = await getDailySummary(supabase);
      replyText = buildDailySummaryReply(summary);
      break;
    }

    case "invalid_order_format":
      replyText = buildInvalidOrderFormatReply();
      break;

    case "invalid_status_code":
      replyText = buildInvalidStatusCodeReply();
      break;

    case "ambiguous_quantity":
      replyText = buildAmbiguousQuantityReply();
      break;

    case "invalid_quantity":
      replyText = buildInvalidQuantityReply(command.reason);
      break;

    default:
      return { replied: false };
  }

  await replyToLine(event.replyToken, replyText, channelAccessToken);
  return { replied: true, replyText };
}

/**
 * Resolves a ใช่ / เลือก N / สร้าง <price> reply against the active pending
 * confirmation for this (group, user) scope, if any. Returns the reply
 * text to send, or null if there was nothing pending AND the raw text
 * doesn't otherwise look like a confirmation attempt worth responding to
 * (so the caller can silently fall through, matching how every other
 * unaddressed message in this system is handled).
 */
async function handlePendingConfirmationReply(
  supabase: SupabaseClient,
  groupId: string,
  userId: string | null,
  command: NonNullable<ReturnType<typeof parseConfirmationCommand>>
): Promise<string | null> {
  const pending = await getActivePendingConfirmation(supabase, groupId, userId);

  if (!pending) {
    // Distinguishing "expired" from "never existed" is intentionally not
    // done here -- both cases get the same reply, per the approved design.
    return buildNoPendingConfirmationReply();
  }

  switch (command.kind) {
    case "confirm_yes": {
      if (pending.mode !== "confirm" || pending.candidates.length !== 1) {
        return buildNoPendingConfirmationReply();
      }
      return resolveWithExistingProduct(supabase, pending, pending.candidates[0].id);
    }

    case "confirm_select": {
      if (pending.mode !== "select") {
        return buildNoPendingConfirmationReply();
      }
      const chosen = pending.candidates[command.index - 1];
      if (!chosen) {
        // Invalid selection -- pending state is left intact so the user
        // can retry with a valid number within the expiry window.
        return buildInvalidSelectionReply(pending.candidates.length);
      }
      return resolveWithExistingProduct(supabase, pending, chosen.id);
    }

    case "confirm_create": {
      if (pending.mode !== "create") {
        return buildNoPendingConfirmationReply();
      }
      const price = parsePriceArgument(command.rawPrice);
      if (price === null) {
        // Invalid price -- pending state is left intact, same reasoning
        // as an invalid selection above.
        return buildInvalidPriceReply();
      }
      const product = await createProduct(supabase, {
        name: pending.raw_query,
        unit: "",
        selling_price: price,
        cost_price: 0,
        active: true,
      });
      await consumePendingConfirmation(supabase, pending.id);
      const order = await createOrder(supabase, {
        product,
        quantity: pending.quantity,
        customer: pending.customer_name,
        lineGroupId: groupId || null,
      });
      return buildOrderSummaryReply(order, product.unit);
    }

    default:
      return buildNoPendingConfirmationReply();
  }
}

async function resolveWithExistingProduct(
  supabase: SupabaseClient,
  pending: PendingConfirmationRecord,
  productId: string
): Promise<string> {
  const products = await listProducts(supabase);
  const product = products.find((p: ProductRecord) => p.id === productId);

  await consumePendingConfirmation(supabase, pending.id);

  if (!product) {
    // The product was deactivated/removed in the window between the
    // proposal and the confirmation -- treat it the same as "not found"
    // rather than creating an order against a product that's gone.
    return buildProductNotFoundReply(pending.raw_query);
  }

  const order = await createOrder(supabase, {
    product,
    quantity: pending.quantity,
    customer: pending.customer_name,
    lineGroupId: pending.line_group_id || null,
  });
  return buildOrderSummaryReply(order, product.unit);
}
