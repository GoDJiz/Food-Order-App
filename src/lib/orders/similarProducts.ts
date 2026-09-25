import type { ProductRecord } from "@/lib/orders/getActiveProductByName";

export const SIMILARITY_THRESHOLD = 0.75; // named, tunable constant per the approved design
const MIN_COMPACT_LENGTH = 4; // guard against short generic names over-matching
const MAX_CANDIDATES_SHOWN = 5; // safety cap for the reply list on a large catalog

export type SimilarProductSearchResult =
  | { kind: "none" }
  | { kind: "single"; product: ProductRecord }
  | { kind: "multiple"; candidates: ProductRecord[] };

/**
 * The new similarity tier, run ONLY after the existing exact-match and
 * Damerau-Levenshtein <= 1 passes (in matchProduct.ts) have both already
 * found nothing. This function does not replace or alter that existing
 * behavior in any way -- it is purely an additional, later-priority check.
 *
 * Unlike the existing fuzzy tier, a single strong match here is never
 * auto-selected -- the caller is expected to ask for explicit user
 * confirmation regardless of how many candidates come back.
 */
export function searchSimilarProducts(
  query: string,
  products: ProductRecord[]
): SimilarProductSearchResult {
  const activeProducts = products.filter((p) => p.active === true);
  const compactQuery = compact(query);

  if (Array.from(compactQuery).length < MIN_COMPACT_LENGTH) {
    return { kind: "none" };
  }

  const scored = activeProducts
    .map((p) => ({ product: p, ratio: sequenceMatcherRatio(compactQuery, compact(p.name)) }))
    .filter((s) => s.ratio >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.ratio - a.ratio);

  if (scored.length === 0) {
    return { kind: "none" };
  }

  if (scored.length === 1) {
    return { kind: "single", product: scored[0].product };
  }

  // Two or more products clear the threshold: per the approved design,
  // this is always shown as a numbered choice -- never silently narrowed
  // down to a single "best" match by score alone, even if one is
  // numerically well ahead of the others.
  return {
    kind: "multiple",
    candidates: scored.slice(0, MAX_CANDIDATES_SHOWN).map((s) => s.product),
  };
}

/**
 * Trims, collapses whitespace, case-folds, NFC-normalizes, and removes
 * separator characters (+, -, _, whitespace) entirely -- so "A+B", "A B",
 * and "AB" (concatenated with no separator) all compare on equal footing.
 */
function compact(value: string): string {
  return value.trim().replace(/[\s+\-_]+/g, "").toLowerCase().normalize("NFC");
}

/**
 * SequenceMatcher-style similarity ratio: 2 * LCS(a, b) / (len(a) + len(b)),
 * the same well-known, deterministic formula behind Python's
 * difflib.SequenceMatcher.ratio(). Operates on already-compacted strings.
 * Dependency-free -- no external library.
 */
export function sequenceMatcherRatio(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  const total = s.length + t.length;
  if (total === 0) return 1; // both empty -> identical
  const lcs = lcsLength(s, t);
  return (2 * lcs) / total;
}

function lcsLength(s: string[], t: string[]): number {
  const m = s.length;
  const n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}
