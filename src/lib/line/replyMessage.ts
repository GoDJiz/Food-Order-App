const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

/**
 * Sends a reply via the LINE Reply API using the event's replyToken.
 * Uses Reply (not Push), which does not consume the monthly free-tier
 * push-message quota.
 */
export async function replyToLine(
  replyToken: string,
  text: string,
  channelAccessToken: string
): Promise<void> {
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
}
