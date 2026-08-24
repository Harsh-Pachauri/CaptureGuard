// Seeds the single merchants row this single-tenant MVP runs against.
// auto_reversal_window_hours starts from AUTO_REVERSAL_WINDOW_HOURS_DEFAULT
// (env) — the value actually used by the Decision Engine lives in this DB
// row from here on, editable via GET/PATCH /api/config or the Admin screen
// without a redeploy (this is what makes a shortened demo window possible).
import "./env"; // must be first: loads .env before AUTO_REVERSAL_WINDOW_HOURS_DEFAULT is read below
import { prisma } from "../lib/db/client";

async function main() {
  const existing = await prisma.merchant.findFirst();
  if (existing) {
    console.log(`Merchant already seeded: ${existing.name} (${existing.id})`);
    console.log(`  autoReversalWindowHours = ${existing.autoReversalWindowHours}`);
    console.log(`  matchConfidenceThreshold = ${existing.matchConfidenceThreshold}`);
    return;
  }

  const windowHours = Number(process.env.AUTO_REVERSAL_WINDOW_HOURS_DEFAULT ?? "24");

  const merchant = await prisma.merchant.create({
    data: {
      name: "CaptureGuard Demo Merchant",
      autoReversalWindowHours: windowHours,
      matchConfidenceThreshold: 0.7,
    },
  });

  console.log(`Seeded merchant ${merchant.id} with autoReversalWindowHours=${windowHours}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
