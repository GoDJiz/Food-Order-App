import type { ProductRecord } from "@/lib/orders/getActiveProductByName";

export type ProductMatchResult =
  | { matched: true; product: ProductRecord; consumedCount: number }
  | { matched: false; reason: "not_found" }
  | { matched: false; reason: "ambiguous"; candidates: string[] };

const MAX_PRODUCT_PREFIX_TOKENS = 6;
const FUZZY_MAX_DISTANCE = 1;
const FUZZY_MIN_LENGTH = 2; // avoid fuzzy-matching absurdly short tokens

/**
 * Stage 2 (pure — takes the active product list as plain data, no DB call
 * itself). Restricts the search to token indices strictly before qtyIndex,
 * since the product name always leads the message (see design review).
 *
 * Priority, per the approved design:
 *  1. Exact match, longest prefix first, across ALL prefix lengths, before
 *     any fuzzy matching is attempted at all.
 *  2. Only if no exact match exists anywhere: fuzzy match (Damerau-
 *     Levenshtein distance <= 1), longest prefix first. The first prefix
 *     length with any fuzzy candidates decides the outcome — if exactly
 *     one candidate, it's accepted; if 2+, it's reported as ambiguous
 *     without falling through to a shorter prefix.
 */
export function matchProduct(
  tokens: string[],
  qtyIndex: number,
  products: ProductRecord[]
): ProductMatchResult {
  // Defensive: never match an inactive product, even if a future caller
  // accidentally passes one in. Today's only call site already pre-filters
  // via listProducts(), but this guarantee should not depend on that.
  const activeProducts = products.filter((p) => p.active === true);

  const maxK = Math.min(qtyIndex, MAX_PRODUCT_PREFIX_TOKENS);
  if (maxK < 1) {
    return { matched: false, reason: "not_found" };
  }

  // Pass 1: exact match, longest prefix first, across all k.
  for (let k = maxK; k >= 1; k--) {
    const candidate = normalize(tokens.slice(0, k).join(" "));
    const exact = activeProducts.find((p) => normalize(p.name) === candidate);
    if (exact) {
      return { matched: true, product: exact, consumedCount: k };
    }
  }

  // Pass 2: fuzzy match, longest prefix first. Stop at the first k with
  // any candidates at all (whether that resolves cleanly or is ambiguous).
  for (let k = maxK; k >= 1; k--) {
    const candidate = normalize(tokens.slice(0, k).join(" "));
    if (candidate.length < FUZZY_MIN_LENGTH) continue;

    const scored = activeProducts
      .map((p) => ({ product: p, distance: damerauLevenshtein(candidate, normalize(p.name)) }))
      .filter((s) => s.distance <= FUZZY_MAX_DISTANCE);

    if (scored.length === 1) {
      return { matched: true, product: scored[0].product, consumedCount: k };
    }
    if (scored.length > 1) {
      return { matched: false, reason: "ambiguous", candidates: scored.map((s) => s.product.name) };
    }
    // scored.length === 0 at this k -> try a shorter prefix.
  }

  return { matched: false, reason: "not_found" };
}

/**
 * Trims and collapses internal whitespace, case-folds, and applies
 * Unicode NFC normalization so differently-composed-but-visually-identical
 * strings (e.g. a decomposed vs. precomposed Thai combining-mark sequence)
 * compare and score consistently. This is the "normalize harmless
 * differences" step from rule B — it does not alter meaningful characters.
 */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase().normalize("NFC");
}

/**
 * Damerau-Levenshtein edit distance (insertions, deletions, substitutions,
 * and adjacent transpositions each cost 1). Operates on Unicode code
 * points via Array.from, so combining marks in Thai script are compared
 * as individual codepoints — consistent with how the approved examples'
 * typos were analyzed (e.g. a single missing tone-mark codepoint).
 *
 * Dependency-free by design — no external fuzzy-matching library.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }

  return d[m][n];
}
