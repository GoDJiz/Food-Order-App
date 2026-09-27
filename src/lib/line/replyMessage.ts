const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export interface LineReplyResult {
  /**
   * The LINE-assigned message id of the sent message, when available.
   * Used to support "reply to this order message" -- a later incoming
   * webhook event's `quotedMessageId` is compared against this value.
   * LINE's docs confirm sentMessages[].id is returned for every message
   * sent via the Reply API; this is optional here only as a defensive
   * fallback in case a future response shape omits it.
   */
  sentMessageId: string | null;
}

/**
 * Sends a reply via the LINE Reply API using the event's replyToken.
 * Uses Reply (not Push), which does not consume the monthly free-tier
 * push-message quota. Returns the sent message's id so callers can persist
 * it for the reply-to-order-message feature.
 */
export async function replyToLine(
  replyToken: string,
  text: string,
  channelAccessToken: string
): Promise<LineReplyResult> {
  const res = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE reply failed (${res.status}): ${body}`);
  }

  try {
    const body = (await res.json()) as { sentMessages?: Array<{ id?: string }> };
    const sentMessageId = body.sentMessages?.[0]?.id ?? null;
    return { sentMessageId };
  } catch {
    // Response wasn't valid JSON for some reason -- the message still
    // sent successfully (res.ok was true), just without an id to persist.
    return { sentMessageId: null };
  }
}
