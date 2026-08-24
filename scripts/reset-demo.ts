// Local dev/demo reset utility — NOT exposed via any API route, run
// manually between rehearsals. Clears everything a live demo run creates
// (real-Razorpay-backed payments and their decisions/actions/webhook
// events, demo-sourced support queries, and the audit rows that reference
// them) and resets the merchant's policy config back to .env defaults, in
// case the ESCALATE step left the safety window shortened.
//
// This intentionally deletes audit_events rows, which is otherwise against
// the append-only principle described in Section 13 — that principle is
// about the running application never exposing a delete path (no API route
// does), not about this standalone rehearsal tool.
//
// Left untouched: the merchants row itself, and all eval_cases/eval_runs/
// eval_results (npm run db:seed:eval data — expensive-ish to regenerate,
// cheap to keep).
//
// Real Razorpay Test Mode orders/payments you already created still exist
// in the Razorpay Dashboard — this only clears CaptureGuard's local view of
// them. Create fresh ones with `npx tsx scripts/create-demo-payments.ts`.
import "./env";
import { prisma } from "../lib/db/client";

async function main() {
  console.log("Resetting local demo state...\n");

  const demoQueries = await prisma.supportQuery.findMany({
    where: { source: "demo" },
    select: { id: true },
  });
  const realPayments = await prisma.payment.findMany({
    where: { dataSource: "real" },
    select: { id: true },
  });
  const demoQueryIds = demoQueries.map((q) => q.id);
  const realPaymentIds = realPayments.map((p) => p.id);

  const decisions = await prisma.decision.findMany({
    where: {
      OR: [{ supportQueryId: { in: demoQueryIds } }, { paymentId: { in: realPaymentIds } }],
    },
    select: { id: true },
  });
  const decisionIds = decisions.map((d) => d.id);

  const actions = await prisma.action.findMany({
    where: { decisionId: { in: decisionIds } },
    select: { id: true },
  });
  const actionIds = actions.map((a) => a.id);

  const deletedActions = await prisma.action.deleteMany({ where: { id: { in: actionIds } } });
  const deletedDecisions = await prisma.decision.deleteMany({ where: { id: { in: decisionIds } } });
  const deletedWebhooks = await prisma.webhookEvent.deleteMany({
    where: { paymentId: { in: realPaymentIds } },
  });
  const deletedQueries = await prisma.supportQuery.deleteMany({ where: { source: "demo" } });
  const deletedPayments = await prisma.payment.deleteMany({ where: { dataSource: "real" } });

  const deletedAudit1 = await prisma.auditEvent.deleteMany({
    where: { refTable: "payments", refId: { in: realPaymentIds } },
  });
  const deletedAudit2 = await prisma.auditEvent.deleteMany({
    where: { refTable: "decisions", refId: { in: decisionIds } },
  });
  const deletedAudit3 = await prisma.auditEvent.deleteMany({
    where: { refTable: "actions", refId: { in: actionIds } },
  });
  const deletedAudit4 = await prisma.auditEvent.deleteMany({
    where: { refTable: "support_queries", refId: { in: demoQueryIds } },
  });
  const deletedAuditTotal =
    deletedAudit1.count + deletedAudit2.count + deletedAudit3.count + deletedAudit4.count;

  const merchant = await prisma.merchant.findFirst();
  if (merchant) {
    const defaultWindow = Number(process.env.AUTO_REVERSAL_WINDOW_HOURS_DEFAULT ?? "24");
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { autoReversalWindowHours: defaultWindow, matchConfidenceThreshold: 0.7 },
    });
    console.log(`Merchant policy reset: window=${defaultWindow}h, matchConfidenceThreshold=0.7`);
  } else {
    console.log("No merchant row found — run `npm run db:seed:merchant` before demoing.");
  }

  console.log(
    `Deleted: ${deletedPayments.count} payments, ${deletedDecisions.count} decisions, ` +
      `${deletedActions.count} actions, ${deletedWebhooks.count} webhook events, ` +
      `${deletedQueries.count} support queries, ${deletedAuditTotal} audit events.`
  );
  console.log(
    "\nLocal state is clean. Real Razorpay Test Mode orders you already created still exist in the " +
      "Razorpay Dashboard (harmless) — run `npx tsx scripts/create-demo-payments.ts` for fresh ones."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
