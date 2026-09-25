import { isValidOrderNumberFormat } from "@/lib/date";
import { isValidStatusCode } from "@/lib/orders/status";

export type ParsedCommand =
  // Stage 1 output for a candidate new-order message: tokenized, with the
  // single quantity token located and validated. Product/customer/unit
  // resolution (Stage 2/3) happens separately, in matchProduct.ts +
  // extractCustomer.ts, because it requires the live product catalog.
  | { kind: "new_order_tokens"; tokens: string[]; quantity: number; qtyIndex: number }
  | { kind: "order_lookup"; orderNumber: string }
  | { kind: "order_status_change"; orderNumber: string; statusCode: "1" | "2" | "3" | "4" }
  | { kind: "summary" }
  | { kind: "not_a_command" } // message doesn't start with "!" — ignore silently
  | { kind: "invalid_order_format" }
  | { kind: "invalid_status_code" }
  // New-order specific quantity errors (rule A). Kept distinct from
  // invalid_order_format so replies can be specific about what's wrong.
  | { kind: "invalid_quantity"; reason: "zero_or_negative" | "decimal" }
  | { kind: "ambiguous_quantity" };

/**
 * Routes a raw LINE message text to the correct command shape.
 * Order of checks matters: "#..." commands and "!summary" are checked
 * before falling back to the new-order tokenizer.
 */
export function parseOrderMessage(rawText: string): ParsedCommand {
  const text = rawText.trim();

  if (!text.startsWith("!")) {
    return { kind: "not_a_command" };
  }

  const body = text.slice(1).trim();

  if (body.toLowerCase() === "summary") {
    return { kind: "summary" };
  }

  if (body.startsWith("#")) {
    return parseOrderNumberCommand(body);
  }

  return tokenizeNewOrderCommand(body);
}

function parseOrderNumberCommand(body: string): ParsedCommand {
  // Split into at most 2 tokens: "#260916-0001" and optionally a status digit.
  const tokens = body.split(/\s+/).filter(Boolean);
  const orderNumber = tokens[0];

  if (!isValidOrderNumberFormat(orderNumber)) {
    return { kind: "invalid_order_format" };
  }

  if (tokens.length === 1) {
    return { kind: "order_lookup", orderNumber };
  }

  if (tokens.length === 2) {
    const code = tokens[1];
    if (!isValidStatusCode(code)) {
      return { kind: "invalid_status_code" };
    }
    return { kind: "order_status_change", orderNumber, statusCode: code };
  }

  // More than 2 tokens after "!#..." is not a recognized shape.
  return { kind: "invalid_order_format" };
}

// Matches any token that "looks like a number" — including zero, negative,
// and decimal — so those can be rejected with a specific reason rather
// than silently falling through to a generic invalid-format error.
const NUMBER_LIKE = /^-?\d+(\.\d+)?$/;

// Matches a digit run embedded within a larger token (e.g. the "1" inside
// "น้ำส้ม1" or "1ขวด"), including an optional decimal portion. Used only
// for the attached-number fallback pass — never for whole-token detection,
// which is handled separately above so existing zero/negative/decimal
// behavior for complete numeric tokens is fully preserved.
const EMBEDDED_DIGIT_RUN = /\d+(\.\d+)?/g;

/**
 * Stage 1 (pure, no DB access): tokenizes the message body and locates
 * exactly one quantity token, applying rule A.
 *
 * Two passes, in strict priority order:
 *
 * Pass 1 — whole-token numeric detection (unchanged from before attached-
 * number support was added):
 *  - zero whole-token numeric tokens -> fall through to Pass 2
 *  - 2+ whole-token numeric tokens -> ambiguous_quantity (never guess)
 *  - exactly one whole-token numeric token, but it's zero/negative/decimal
 *    -> invalid_quantity
 *  - exactly one valid whole-token numeric token -> use it; embedded
 *    digits elsewhere (e.g. in a customer name) are never inspected once
 *    a clear quantity already exists.
 *
 * Pass 2 — attached-number fallback, only reached when Pass 1 found zero
 * whole-token numeric tokens:
 *  - a token containing 2+ digit runs (e.g. "1ขวด2") is inherently
 *    ambiguous on its own -> ambiguous_quantity immediately
 *  - zero tokens contain any embedded digit run -> invalid_order_format
 *    (nothing that could be a quantity anywhere in the message)
 *  - more than one different token contains an embedded digit run ->
 *    ambiguous_quantity (never guess which one is the real quantity)
 *  - exactly one token contains exactly one digit run -> that token alone
 *    is decomposed into [prefix, number, suffix] and spliced into the
 *    token stream in its place; every other token is left completely
 *    untouched. Everything downstream (Stage 2/3) then runs unchanged on
 *    the resulting stream.
 *
 * In both passes, a quantity token ending up at index 0 (nothing before
 * it) is rejected as invalid_order_format, since the product name must
 * lead the message and there's no room for one before the quantity.
 */
function tokenizeNewOrderCommand(body: string): ParsedCommand {
  // Normalize harmless whitespace differences: trim + collapse repeated
  // internal whitespace before splitting.
  const rawTokens = body.trim().split(/\s+/).filter(Boolean);

  if (rawTokens.length < 2) {
    return { kind: "invalid_order_format" };
  }

  // --- Pass 1: whole-token numeric detection ---
  const wholeNumericIndices: number[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    if (NUMBER_LIKE.test(rawTokens[i])) {
      wholeNumericIndices.push(i);
    }
  }

  if (wholeNumericIndices.length > 1) {
    return { kind: "ambiguous_quantity" };
  }

  if (wholeNumericIndices.length === 1) {
    const qtyIndex = wholeNumericIndices[0];
    const rawQty = rawTokens[qtyIndex];

    const quantityError = validateQuantityString(rawQty);
    if (quantityError) return quantityError;

    if (qtyIndex === 0) {
      return { kind: "invalid_order_format" };
    }

    return { kind: "new_order_tokens", tokens: rawTokens, quantity: Number(rawQty), qtyIndex };
  }

  // --- Pass 2: attached-number fallback (only reached when Pass 1 found
  // no whole-token numeric tokens at all) ---
  let carrierTokenIndex = -1;
  let carrierRunCount = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const runs = rawTokens[i].match(EMBEDDED_DIGIT_RUN);
    if (!runs) continue;

    if (runs.length > 1) {
      // Two or more digit runs within a single token is ambiguous on its
      // own, regardless of what any other token contains.
      return { kind: "ambiguous_quantity" };
    }

    if (carrierTokenIndex !== -1) {
      // A second, different token also contains a digit run -> ambiguous.
      return { kind: "ambiguous_quantity" };
    }

    carrierTokenIndex = i;
    carrierRunCount = runs.length;
  }

  if (carrierTokenIndex === -1 || carrierRunCount === 0) {
    return { kind: "invalid_order_format" };
  }

  const carrierToken = rawTokens[carrierTokenIndex];
  const match = EMBEDDED_DIGIT_RUN.exec(carrierToken);
  // Reset lastIndex since EMBEDDED_DIGIT_RUN is a shared /g regex.
  EMBEDDED_DIGIT_RUN.lastIndex = 0;
  if (!match) {
    return { kind: "invalid_order_format" };
  }

  const numberText = match[0];
  const prefix = carrierToken.slice(0, match.index);
  const suffix = carrierToken.slice(match.index + numberText.length);

  const quantityError = validateQuantityString(numberText);
  if (quantityError) return quantityError;

  // Splice the decomposed token into the stream in place; every other
  // token is left byte-for-byte unchanged.
  const expanded: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    if (i !== carrierTokenIndex) {
      expanded.push(rawTokens[i]);
      continue;
    }
    if (prefix) expanded.push(prefix);
    const qtyIndex = expanded.length;
    expanded.push(numberText);
    if (suffix) expanded.push(suffix);

    if (qtyIndex === 0) {
      return { kind: "invalid_order_format" };
    }

    return { kind: "new_order_tokens", tokens: expanded.concat(rawTokens.slice(i + 1)), quantity: Number(numberText), qtyIndex };
  }

  // Unreachable — carrierTokenIndex was found above.
  return { kind: "invalid_order_format" };
}

/**
 * Shared zero/negative/decimal validation for a raw quantity string,
 * whether it came from a whole numeric token (Pass 1) or an embedded
 * digit run (Pass 2). Returns an error command, or null if the string is
 * a valid positive integer quantity.
 */
function validateQuantityString(raw: string): ParsedCommand | null {
  if (raw.includes(".")) {
    return { kind: "invalid_quantity", reason: "decimal" };
  }
  const value = Number(raw);
  if (!(value > 0)) {
    return { kind: "invalid_quantity", reason: "zero_or_negative" };
  }
  return null;
}
