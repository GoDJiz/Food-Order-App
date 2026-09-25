/**
 * Usage: npx tsx scripts/generate-pin-hash.ts 1234
 * Prints a bcrypt hash to paste into DASHBOARD_PIN_HASH (Vercel env vars
 * and/or local .env). The plaintext PIN itself is never stored anywhere —
 * only this hash.
 */
import bcrypt from "bcryptjs";

async function main() {
  const pin = process.argv[2];
  if (!pin) {
    console.error("Usage: npx tsx scripts/generate-pin-hash.ts <PIN>");
    process.exit(1);
  }

  const hash = await bcrypt.hash(pin, 12);
  console.log("\nDASHBOARD_PIN_HASH=" + hash + "\n");
}

main();
