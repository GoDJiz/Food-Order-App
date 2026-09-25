import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPin } from "@/lib/auth/pin";

test("rejects when DASHBOARD_PIN_HASH is not configured", async () => {
  assert.equal(await verifyPin("1234", undefined), false);
});

test("rejects an empty submitted PIN", async () => {
  assert.equal(await verifyPin("", "$2a$12$fakehashfakehashfakehashfakehashfakehashfake"), false);
});

// NOTE: the actual bcrypt.compare() round trip (correct PIN -> true,
// wrong PIN -> false) requires the `bcryptjs` package, which is not
// installed in this offline sandbox (no network access). This is declared
// in package.json and must be verified with `npm install && npm test`
// once dependencies can be installed (e.g. in CI or after `npm install`
// locally/on Vercel). The guard-clause behavior above (missing hash /
// missing PIN) is fully covered here without that dependency.
