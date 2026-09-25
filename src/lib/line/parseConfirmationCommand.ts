export type ConfirmationCommand =
  | { kind: "confirm_yes" }
  | { kind: "confirm_select"; index: number } // 1-based, as typed by the user
  | { kind: "confirm_create"; rawPrice: string };

/**
 * These three commands intentionally do NOT require the "!" prefix used by
 * every other command in this system -- they match the exact reply text
 * the bot itself sends (per the approved design: "พิมพ์ 'ใช่'...", "เลือก
 * 1", "สร้าง 50"). This is safe specifically because these commands are
 * only ever acted on when an active pending confirmation already exists
 * for that (group, user) scope (checked by the caller) -- an ordinary
 * group-chat message that happens to say "ใช่" with no pending state
 * behind it is simply ignored, exactly like any other non-"!" message.
 *
 * Returns null for anything that doesn't match one of these three exact
 * shapes -- the caller falls through to the existing "!"-prefixed command
 * parsing unchanged.
 */
export function parseConfirmationCommand(rawText: string): ConfirmationCommand | null {
  const text = rawText.trim();

  if (normalizeYes(text) === "ใช่") {
    return { kind: "confirm_yes" };
  }

  const selectMatch = text.match(/^เลือก\s+(\S+)$/);
  if (selectMatch) {
    const digits = selectMatch[1];
    if (/^\d+$/.test(digits)) {
      const index = Number(digits);
      if (index > 0) {
        return { kind: "confirm_select", index };
      }
    }
    // "เลือก" followed by something non-numeric or zero is not a
    // recognized selection at all -- fall through to not_a_command,
    // consistent with how every other unrecognized shape is handled.
    return null;
  }

  const createMatch = text.match(/^สร้าง\s+(\S+)$/);
  if (createMatch) {
    return { kind: "confirm_create", rawPrice: createMatch[1] };
  }

  return null;
}

function normalizeYes(text: string): string {
  return text.trim().normalize("NFC");
}

/**
 * Parses and validates a price argument for "สร้าง <price>". Accepts
 * positive decimals (prices are commonly non-integer, unlike quantities).
 * Rejects non-numeric, negative, and zero -- returns null for all of
 * those, so the caller never has to guess what "invalid" means here.
 */
export function parsePriceArgument(raw: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!(value > 0)) return null;
  return value;
}
