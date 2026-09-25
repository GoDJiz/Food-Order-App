import type { SupabaseClient } from "@supabase/supabase-js";
import { replyToLine } from "@/lib/line/replyMessage";
import { parseOrderMessage } from "@/lib/line/parseOrderMessage";
import { matchProduct } from "@/lib/orders/matchProduct";
import { extractCustomer } from "@/lib/orders/extractCustomer";
import { listProducts } from "@/lib/products/products";
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
} from "@/lib/line/buildReplyText";

export interface LineEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source?: { groupId?: string; type?: string };
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
  const command = parseOrderMessage(text);

  if (command.kind === "not_a_command") {
    return { replied: false }; // ordinary group chat message, not addressed to the bot
  }

  if (!event.replyToken) {
    return { replied: false }; // nothing we can reply to
  }

  const groupId = event.source?.groupId ?? null;
  let replyText: string;

  switch (command.kind) {
    case "new_order_tokens": {
      // Stage 2: resolve the product against the active catalog.
      const activeProducts = await listProducts(supabase);
      const match = matchProduct(command.tokens, command.qtyIndex, activeProducts);

      if (!match.matched) {
        if (match.reason === "ambiguous") {
          replyText = buildAmbiguousProductReply(match.candidates);
        } else {
          const attemptedName = command.tokens.slice(0, command.qtyIndex).join(" ");
          replyText = buildProductNotFoundReply(attemptedName);
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
        lineGroupId: groupId,
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
