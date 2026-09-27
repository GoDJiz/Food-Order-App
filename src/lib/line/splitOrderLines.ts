import { parseOrderMessage, type ParsedCommand } from "@/lib/line/parseOrderMessage";

/**
 * Splits a raw message body into non-blank lines, on "\n" or "\r\n" only
 * (rule 1). Each line is trimmed; blank/whitespace-only lines are dropped
 * entirely (rule 11). A message with a single trailing newline, or none at
 * all, naturally collapses to a one-element (or zero-element) array.
 */
export function splitIntoNonBlankLines(text: string): string[] {
  return text
    .split(/\r\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * A leading "!" is optional on lines after the first (rule 3). This adds
 * it back only when missing, so every line can be run through the
 * existing, unmodified parseOrderMessage() exactly as if it had been sent
 * on its own.
 */
export function ensureBangPrefix(line: string): string {
  return line.startsWith("!") ? line : `!${line}`;
}

/**
 * Classifies a parsed command as either "order input" (a new-order attempt,
 * valid or not) or a "special command" (order lookup/status change,
 * summary, invalid status code). Multi-line splitting is only ever applied
 * when EVERY non-blank line classifies as order input -- if even one line
 * looks like a special command, the whole message falls back to being
 * parsed exactly as today (as a single command spanning the full raw
 * text), so existing commands always keep priority and a stray newline
 * inside an existing command never turns it into multiple commands.
 */
export function isOrderInputKind(kind: ParsedCommand["kind"]): boolean {
  return (
    kind === "new_order_tokens" ||
    kind === "invalid_order_format" ||
    kind === "ambiguous_quantity" ||
    kind === "invalid_quantity"
  );
}

export interface ClassifiedLine {
  lineNumber: number; // 1-based, matches what a person would count reading the message
  command: ParsedCommand;
}

/**
 * Attempts to classify a raw multi-line message as a batch of order-input
 * lines. Returns null (meaning: do not engage multi-line handling at all;
 * fall back to the single-command path) when there are fewer than two
 * non-blank lines, when the FIRST line doesn't start with "!" (a leading
 * "!" is only optional on lines after the first -- the first line still
 * has to look like an intentional command, consistent with how every
 * other message in this system is only ever addressed to the bot by
 * starting with "!"), or when any line is not an order-input line.
 */
export function classifyAsMultiLineOrders(text: string): ClassifiedLine[] | null {
  const lines = splitIntoNonBlankLines(text);
  if (lines.length < 2) {
    return null;
  }

  if (!lines[0].startsWith("!")) {
    return null;
  }

  const classified = lines.map((line, i) => ({
    lineNumber: i + 1,
    command: parseOrderMessage(ensureBangPrefix(line)),
  }));

  const allOrderInput = classified.every((c) => isOrderInputKind(c.command.kind));
  if (!allOrderInput) {
    return null;
  }

  return classified;
}
