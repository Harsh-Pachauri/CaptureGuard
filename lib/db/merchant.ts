import { prisma } from "./client";

/**
 * Single-tenant MVP: exactly one merchants row, seeded by
 * scripts/seed-merchant.ts. This is where `auto_reversal_window_hours` — the
 * configurable safety-window policy value the Decision Engine reads — and
 * `match_confidence_threshold` actually live, never hardcoded in the engine.
 */
export async function getMerchant() {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    throw new Error(
      "No merchant row found. Run `npm run db:seed:merchant` before starting the app."
    );
  }
  return merchant;
}
