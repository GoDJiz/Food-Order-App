import { test } from "node:test";
import assert from "node:assert/strict";
import { replyToLine } from "@/lib/line/replyMessage";

function withMockedFetch(responseBody: any, ok = true) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    } as any;
  }) as any;
  return () => {
    globalThis.fetch = original;
  };
}

test("returns the sent message id from LINE's response", async () => {
  const restore = withMockedFetch({ sentMessages: [{ id: "461230966842064897", quoteToken: "abc" }] });
  const result = await replyToLine("reply-token", "hello", "fake-token");
  restore();
  assert.equal(result.sentMessageId, "461230966842064897");
});

test("returns null sentMessageId when the response has no sentMessages", async () => {
  const restore = withMockedFetch({});
  const result = await replyToLine("reply-token", "hello", "fake-token");
  restore();
  assert.equal(result.sentMessageId, null);
});

test("returns null sentMessageId when the response body is not valid JSON", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "not json",
    } as any;
  }) as any;

  const result = await replyToLine("reply-token", "hello", "fake-token");
  globalThis.fetch = original;
  assert.equal(result.sentMessageId, null);
});

test("throws when LINE responds with a non-ok status", async () => {
  const restore = withMockedFetch({ message: "Invalid reply token" }, false);
  await assert.rejects(() => replyToLine("bad-token", "hello", "fake-token"));
  restore();
});
