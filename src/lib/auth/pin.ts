/**
 * Verifies a submitted PIN against the bcrypt hash stored in the
 * DASHBOARD_PIN_HASH environment variable. The plaintext PIN is never
 * stored anywhere — only this hash exists, and only in env vars (not the
 * database), per the approved Phase 4 requirements.
 *
 * bcryptjs is imported dynamically so this module can still be imported
 * (e.g. by tests exercising the early-return guard clauses) in
 * environments where the dependency isn't installed yet.
 */
export async function verifyPin(submittedPin: string, pinHash: string | undefined): Promise<boolean> {
  if (!pinHash) return false;
  if (!submittedPin) return false;
  const { default: bcrypt } = await import("bcryptjs");
  return bcrypt.compare(submittedPin, pinHash);
}
