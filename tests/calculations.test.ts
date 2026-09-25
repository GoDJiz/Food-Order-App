import { test } from "node:test";
import assert from "node:assert/strict";

function calc(sellingPrice: number, costPrice: number, quantity: number) {
  const revenue = sellingPrice * quantity;
  const cost = costPrice * quantity;
  const profit = revenue - cost;
  return { revenue, cost, profit };
}

test("revenue/cost/profit match the approved worked example", () => {
  const { revenue, cost, profit } = calc(40, 18, 10);
  assert.equal(revenue, 400);
  assert.equal(cost, 180);
  assert.equal(profit, 220);
});
