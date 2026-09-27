import type { SupabaseClient } from "@supabase/supabase-js";
import { replyToLine } from "@/lib/line/replyMessage";
import { parseOrderMessage, type ParsedCommand } from "@/lib/line/parseOrderMessage";
import { parseConfirmationCommand, parsePriceArgument } from "@/lib/line/parseConfirmationCommand";
import { matchProduct } from "@/lib/orders/matchProduct";
import { extractCustomer } from "@/lib/orders/extractCustomer";
import { searchSimilarProducts } from "@/lib/orders/similarProducts";
import {
  classifyAsMultiLineOrders,
  type ClassifiedLine,
} from "@/lib/line/splitOrderLines";
import {
  getActivePendingConfirmation,
  createPendingConfirmation,
  consumePendingConfirmation,
  type PendingConfirmationRecord,
} from "@/lib/orders/pendingConfirmation";
import { listProducts, createProduct } from "@/lib/products/products";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";
import { getOrderByNumber, getOrderByLastMessageId } from "@/lib/orders/getOrderByNumber";
import { updateOrderStatus, updateOrderStatusById, setOrderLastMessageId } from "@/lib/orders/updateOrderStatus";
import { createOrder } from "@/lib/orders/createOrder";
import { getDailySummary } from "@/lib/orders/getDailySummary";
import { statusFromCode, parseBareStatusReply } from "@/lib/orders/status";
import {
  buildOrderSummaryReply,
  buildOrderUpdatedReply,
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
  buildMultiLineOrderReply,
} from "@/lib/line/buildReplyText";

export interface LineEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source?: { groupId?: string; userId?: string; type?: string };
  message?: { type: string; text?: string; quotedMessageId?: string };
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

/** Result of any branch that resolves to a reply, optionally tied to an order. */
interface ReplyOutcome {
  replyText: string;
  orderId: string | null;
}

/** ReplyOutcome plus whether an order was actually created -- used by the
 * multi-line order batch handler to build its per-line success/failure
 * summary (rule 10). Single-line callers ignore the extra field. */
interface OrderLineOutcome extends ReplyOutcome {
  success: boolean;
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

  // Reply-to-order-message: only engaged when this message is itself a
  // LINE reply/quote (quotedMessageId present) AND we have an order whose
  // last known bot message id matches it AND the reply text is a bare
  // status code/word. Any one of those not holding true falls straight
  // through to the rest of the normal command parsing below -- a reply to
  // an unrelated message, or a reply whose text isn't a status word, never
  // touches an order.
  if (event.message.quotedMessageId) {
    const quotedOutcome = await tryHandleQuotedStatusReply(supabase, event.message.quotedMessageId, text);
    if (quotedOutcome) {
      await sendAndTrack(event.replyToken, quotedOutcome, supabase, channelAccessToken);
      return { replied: true, replyText: quotedOutcome.replyText };
    }
  }

  // Pending-confirmation replies (ใช่ / เลือก N / สร้าง <price>) are checked
  // BEFORE the existing "!"-prefixed command parsing. They intentionally
  // don't use "!" (see parseConfirmationCommand.ts), which is safe because
  // they only ever do anything when an active pending confirmation already
  // exists for this (group, user) scope -- otherwise they fall straight
  // through to today's unchanged "not_a_command" handling below.
  const confirmationCommand = parseConfirmationCommand(text);
  if (confirmationCommand) {
    const outcome = await handlePendingConfirmationReply(supabase, groupId, userId, confirmationCommand);
    if (outcome !== null) {
      await sendAndTrack(event.replyToken, outcome, supabase, channelAccessToken);
      return { replied: true, replyText: outcome.replyText };
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

  // A message that looks like a single new-order attempt (or a Stage-1
  // error) is also checked for multi-line batching -- this only actually
  // engages when there are 2+ non-blank lines AND the first one starts
  // with "!" (see classifyAsMultiLineOrders' docstring), so a genuinely
  // single-line message is completely unaffected and falls through to the
  // switch below exactly as before.
  if (
    command.kind === "new_order_tokens" ||
    command.kind === "invalid_order_format" ||
    command.kind === "ambiguous_quantity" ||
    command.kind === "invalid_quantity"
  ) {
    const classifiedLines = classifyAsMultiLineOrders(text);
    if (classifiedLines) {
      const replyText = await handleMultiLineOrders(classifiedLines, groupId, userId, supabase);
      await replyToLine(event.replyToken, replyText, channelAccessToken);
      // Multi-line batches intentionally don't track a single order's
      // last_line_message_id -- see handleMultiLineOrders' docstring.
      return { replied: true, replyText };
    }
  }

  let outcome: ReplyOutcome;

  switch (command.kind) {
    case "new_order_tokens": {
      outcome = await processNewOrderCommand(command, groupId, userId, supabase, {
        allowPendingConfirmation: true,
      });
      break;
    }

    case "order_lookup": {
      const order = await getOrderByNumber(supabase, command.orderNumber);
      outcome = order
        ? { replyText: buildOrderSummaryReply(order), orderId: order.id }
        : { replyText: buildOrderNotFoundReply(command.orderNumber), orderId: null };
      break;
    }

    case "order_status_change": {
      const existing = await getOrderByNumber(supabase, command.orderNumber);
      if (!existing) {
        outcome = { replyText: buildOrderNotFoundReply(command.orderNumber), orderId: null };
        break;
      }
      const newStatus = statusFromCode(command.statusCode);
      if (!newStatus) {
        outcome = { replyText: buildInvalidStatusCodeReply(), orderId: null };
        break;
      }
      const updated = await updateOrderStatus(supabase, command.orderNumber, newStatus);
      outcome = { replyText: buildOrderUpdatedReply(updated), orderId: updated.id };
      break;
    }

    case "summary": {
      const summary = await getDailySummary(supabase);
      outcome = { replyText: buildDailySummaryReply(summary), orderId: null };
      break;
    }

    case "invalid_order_format":
      outcome = { replyText: buildInvalidOrderFormatReply(), orderId: null };
      break;

    case "invalid_status_code":
      outcome = { replyText: buildInvalidStatusCodeReply(), orderId: null };
      break;

    case "ambiguous_quantity":
      outcome = { replyText: buildAmbiguousQuantityReply(), orderId: null };
      break;

    case "invalid_quantity":
      outcome = { replyText: buildInvalidQuantityReply(command.reason), orderId: null };
      break;

    default:
      return { replied: false };
  }

  await sendAndTrack(event.replyToken, outcome, supabase, channelAccessToken);
  return { replied: true, replyText: outcome.replyText };
}

/**
 * Resolves and (if matched) creates a single new order -- this is the
 * exact logic behind the single-line "new_order_tokens" case, factored
 * out so the multi-line batch handler below can reuse it verbatim rather
 * than duplicating product matching, quantity handling, fuzzy matching,
 * unit stripping, or customer extraction (none of which are touched here
 * at all -- this function only orchestrates calls into them).
 *
 * When allowPendingConfirmation is false (multi-line batch mode), a
 * product that doesn't exactly/fuzzy-match is treated as a simple failed
 * line rather than starting the similar-product-confirmation
 * conversation -- a multi-order message gets one immediate combined
 * reply, not N concurrent pending conversations. The person can always
 * resend that one line alone to get the full similar-product guidance.
 */
async function processNewOrderCommand(
  command: Extract<ParsedCommand, { kind: "new_order_tokens" }>,
  groupId: string,
  userId: string | null,
  supabase: SupabaseClient,
  opts: { allowPendingConfirmation: boolean }
): Promise<OrderLineOutcome> {
  // Stage 2: resolve the product against the active catalog.
  const activeProducts = await listProducts(supabase);
  const match = matchProduct(command.tokens, command.qtyIndex, activeProducts);

  if (!match.matched) {
    if (match.reason === "ambiguous") {
      // Existing Damerau-Levenshtein <= 1 ambiguity -- unchanged.
      return { replyText: buildAmbiguousProductReply(match.candidates), orderId: null, success: false };
    }

    const attemptedName = command.tokens.slice(0, command.qtyIndex).join(" ");

    if (!opts.allowPendingConfirmation) {
      return { replyText: buildProductNotFoundReply(attemptedName), orderId: null, success: false };
    }

    // Existing exact + distance<=1 passes found nothing. Only now does
    // the NEW similarity tier run, per the approved matching order.
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
      return { replyText: buildNoSimilarProductReply(attemptedName), orderId: null, success: false };
    }

    if (similar.kind === "single") {
      await createPendingConfirmation(supabase, {
        groupId,
        userId,
        mode: "confirm",
        rawQuery: attemptedName,
        candidates: [{ id: similar.product.id, name: similar.product.name }],
        quantity: command.quantity,
        customerName: customerForPending,
      });
      return {
        replyText: buildSimilarProductSingleReply(attemptedName, similar.product.name),
        orderId: null,
        success: false,
      };
    }

    await createPendingConfirmation(supabase, {
      groupId,
      userId,
      mode: "select",
      rawQuery: attemptedName,
      candidates: similar.candidates.map((p) => ({ id: p.id, name: p.name })),
      quantity: command.quantity,
      customerName: customerForPending,
    });
    return {
      replyText: buildSimilarProductMultipleReply(attemptedName, similar.candidates.map((p) => p.name)),
      orderId: null,
      success: false,
    };
  }

  // Stage 3: everything else is customer text, minus one unit token.
  const customer = extractCustomer(command.tokens, command.qtyIndex, match.consumedCount, match.product.unit);

  const order = await createOrder(supabase, {
    product: match.product,
    quantity: command.quantity,
    customer,
    lineGroupId: groupId || null,
  });
  return { replyText: buildOrderSummaryReply(order, match.product.unit), orderId: order.id, success: true };
}

/**
 * Processes a multi-line message where every non-blank line is an
 * order-input line (rules 1-12). Lines are processed sequentially, not in
 * parallel, so order numbers come out in the same top-to-bottom sequence
 * as the lines themselves and the existing atomic per-day counter (see
 * generateOrderNumber.ts) is exercised exactly as it already is for any
 * other sequence of orders -- nothing about order-number generation or
 * concurrency handling is touched here.
 *
 * A line that fails (Stage-1 error, ambiguous/not-found product) never
 * discards or rolls back any other line's already-created order (rule 9);
 * all outcomes are collected and sent back as ONE combined reply (rule
 * 10). Multi-line batches deliberately do not track a "last LINE message
 * id" for reply-to-message purposes -- with several orders in one
 * message, a later bare-digit reply to it couldn't be unambiguously
 * attributed to any single one of them, so it's left untracked (a later
 * reply to that message simply won't match anything, the same safe
 * fallback as replying to any unrelated message).
 */
async function handleMultiLineOrders(
  lines: ClassifiedLine[],
  groupId: string,
  userId: string | null,
  supabase: SupabaseClient
): Promise<string> {
  const results: Array<{ lineNumber: number; success: boolean; text: string }> = [];

  for (const line of lines) {
    if (line.command.kind === "new_order_tokens") {
      const outcome = await processNewOrderCommand(line.command, groupId, userId, supabase, {
        allowPendingConfirmation: false,
      });
      results.push({ lineNumber: line.lineNumber, success: outcome.success, text: outcome.replyText });
      continue;
    }

    // One of the Stage-1 error kinds (invalid format / ambiguous quantity
    // / invalid quantity) -- reuse the exact same error-message builders
    // used for a single-line message, never rebuilt here.
    const text =
      line.command.kind === "invalid_quantity"
        ? buildInvalidQuantityReply(line.command.reason)
        : line.command.kind === "ambiguous_quantity"
          ? buildAmbiguousQuantityReply()
          : buildInvalidOrderFormatReply();

    results.push({ lineNumber: line.lineNumber, success: false, text });
  }

  return buildMultiLineOrderReply(results);
}

/**
 * Sends the reply via LINE and, when the outcome is tied to a specific
 * order, persists the sent message's id onto that order so a later reply
 * to THIS message can be matched back to it. Best-effort: if capturing the
 * message id fails for any reason, the reply the user already received is
 * unaffected -- we don't let a tracking failure surface as a user-facing
 * error for a message that was already successfully sent.
 */
async function sendAndTrack(
  replyToken: string,
  outcome: ReplyOutcome,
  supabase: SupabaseClient,
  channelAccessToken: string
): Promise<void> {
  const { sentMessageId } = await replyToLine(replyToken, outcome.replyText, channelAccessToken);
  if (sentMessageId && outcome.orderId) {
    await setOrderLastMessageId(supabase, outcome.orderId, sentMessageId).catch(() => {
      // Non-critical -- see docstring above.
    });
  }
}

/**
 * Handles a LINE reply/quote whose text is a bare status code or Thai
 * status word (no "!" prefix), scoped strictly to messages that are
 * themselves quoting a specific earlier bot order message we recognize.
 * Returns null whenever the reply shouldn't be treated as a status update
 * at all -- callers fall through to normal command parsing in that case.
 */
async function tryHandleQuotedStatusReply(
  supabase: SupabaseClient,
  quotedMessageId: string,
  text: string
): Promise<ReplyOutcome | null> {
  const statusCode = parseBareStatusReply(text);
  if (!statusCode) {
    return null; // not a bare status reply -- not our concern, fall through.
  }

  const order = await getOrderByLastMessageId(supabase, quotedMessageId);
  if (!order) {
    // The quoted message isn't one we recognize as a tracked order message
    // (an unrelated message, or one from before this feature existed, or
    // already superseded by a newer status message). Never guess -- fall
    // through, which for a bare "2"/"รับออเดอร์" with no "!" and no other
    // match results in no reply at all, same as today.
    return null;
  }

  const newStatus = statusFromCode(statusCode);
  if (!newStatus) {
    return null; // unreachable given parseBareStatusReply's contract, but exhaustive.
  }

  const updated = await updateOrderStatusById(supabase, order.id, newStatus);
  return { replyText: buildOrderUpdatedReply(updated), orderId: updated.id };
}

/**
 * Resolves a ใช่ / เลือก N / สร้าง <price> reply against the active pending
 * confirmation for this (group, user) scope, if any. Returns null if there
 * was nothing pending AND the raw text doesn't otherwise look like a
 * confirmation attempt worth responding to (so the caller can silently
 * fall through, matching how every other unaddressed message in this
 * system is handled).
 */
async function handlePendingConfirmationReply(
  supabase: SupabaseClient,
  groupId: string,
  userId: string | null,
  command: NonNullable<ReturnType<typeof parseConfirmationCommand>>
): Promise<ReplyOutcome | null> {
  const pending = await getActivePendingConfirmation(supabase, groupId, userId);

  if (!pending) {
    // Distinguishing "expired" from "never existed" is intentionally not
    // done here -- both cases get the same reply, per the approved design.
    return { replyText: buildNoPendingConfirmationReply(), orderId: null };
  }

  switch (command.kind) {
    case "confirm_yes": {
      if (pending.mode !== "confirm" || pending.candidates.length !== 1) {
        return { replyText: buildNoPendingConfirmationReply(), orderId: null };
      }
      return resolveWithExistingProduct(supabase, pending, pending.candidates[0].id);
    }

    case "confirm_select": {
      if (pending.mode !== "select") {
        return { replyText: buildNoPendingConfirmationReply(), orderId: null };
      }
      const chosen = pending.candidates[command.index - 1];
      if (!chosen) {
        // Invalid selection -- pending state is left intact so the user
        // can retry with a valid number within the expiry window.
        return { replyText: buildInvalidSelectionReply(pending.candidates.length), orderId: null };
      }
      return resolveWithExistingProduct(supabase, pending, chosen.id);
    }

    case "confirm_create": {
      if (pending.mode !== "create") {
        return { replyText: buildNoPendingConfirmationReply(), orderId: null };
      }
      const price = parsePriceArgument(command.rawPrice);
      if (price === null) {
        // Invalid price -- pending state is left intact, same reasoning
        // as an invalid selection above.
        return { replyText: buildInvalidPriceReply(), orderId: null };
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
      return { replyText: buildOrderSummaryReply(order, product.unit), orderId: order.id };
    }

    default:
      return { replyText: buildNoPendingConfirmationReply(), orderId: null };
  }
}

async function resolveWithExistingProduct(
  supabase: SupabaseClient,
  pending: PendingConfirmationRecord,
  productId: string
): Promise<ReplyOutcome> {
  const products = await listProducts(supabase);
  const product = products.find((p: ProductRecord) => p.id === productId);

  await consumePendingConfirmation(supabase, pending.id);

  if (!product) {
    // The product was deactivated/removed in the window between the
    // proposal and the confirmation -- treat it the same as "not found"
    // rather than creating an order against a product that's gone.
    return { replyText: buildProductNotFoundReply(pending.raw_query), orderId: null };
  }

  const order = await createOrder(supabase, {
    product,
    quantity: pending.quantity,
    customer: pending.customer_name,
    lineGroupId: pending.line_group_id || null,
  });
  return { replyText: buildOrderSummaryReply(order, product.unit), orderId: order.id };
}
