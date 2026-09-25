/**
 * Stage 3 (pure): given the full token list, the quantity's index, and how
 * many leading tokens the product consumed, everything else is customer
 * text — except at most one token that exactly matches the product's
 * configured unit (rule D: never treat an arbitrary word as a unit).
 *
 * Customer may legitimately end up empty (e.g. "!น้ำส้ม 3 ขวด") — that is
 * allowed per the approved design and is not an error.
 */
export function extractCustomer(
  tokens: string[],
  qtyIndex: number,
  productConsumedCount: number,
  productUnit: string
): string {
  const excluded = new Set<number>();
  for (let i = 0; i < productConsumedCount; i++) excluded.add(i);
  excluded.add(qtyIndex);

  const remaining = tokens.filter((_, i) => !excluded.has(i));

  const unit = productUnit.trim().toLowerCase();
  let strippedUnit = false;

  const customerTokens = remaining.filter((tok) => {
    if (!strippedUnit && unit.length > 0 && tok.trim().toLowerCase() === unit) {
      strippedUnit = true; // remove only the first occurrence
      return false;
    }
    return true;
  });

  return customerTokens.join(" ").trim();
}
