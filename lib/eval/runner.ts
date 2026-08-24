import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMerchant } from "@/lib/db/merchant";
import { runSupportQueryPipeline } from "@/lib/pipeline/runSupportQuery";
import { getFixtureAsLive } from "@/lib/eval/fixtureSource";

interface FixtureShape {
  razorpayPaymentId?: string;
  razorpayOrderId?: string | null;
  status: string;
  captured: boolean;
  amount: number;
  currency?: string;
  customerRef?: string | null;
  /** Hours relative to "now" — negative means in the past. Preferred over an absolute timestamp so fixtures stay valid whenever the eval is run. */
  razorpayCreatedAtOffsetHours?: number;
  razorpayCreatedAt?: string;
}

async function ensureFixtureSeeded(evalCaseId: string, fixture: FixtureShape): Promise<string> {
  const merchant = await getMerchant();
  const razorpayPaymentId =
    fixture.razorpayPaymentId ?? `pay_EVAL${evalCaseId.replace(/-/g, "").slice(0, 14)}`;
  const razorpayCreatedAt = fixture.razorpayCreatedAt
    ? new Date(fixture.razorpayCreatedAt)
    : new Date(Date.now() + (fixture.razorpayCreatedAtOffsetHours ?? 0) * 60 * 60 * 1000);

  await prisma.payment.upsert({
    where: { razorpayPaymentId },
    create: {
      razorpayPaymentId,
      razorpayOrderId: fixture.razorpayOrderId ?? null,
      merchantId: merchant.id,
      status: fixture.status,
      captured: fixture.captured,
      amount: fixture.amount,
      currency: fixture.currency ?? "INR",
      customerRef: fixture.customerRef ?? null,
      razorpayCreatedAt,
      dataSource: "eval",
    },
    update: {
      status: fixture.status,
      captured: fixture.captured,
      amount: fixture.amount,
      customerRef: fixture.customerRef ?? null,
      razorpayCreatedAt,
    },
  });

  return razorpayPaymentId;
}

export interface EvalMetrics {
  totalCases: number;
  intentAccuracy: number | null;
  matchAccuracy: number | null;
  verdictAccuracy: number;
  falseBlockRate: number;
  falseAllowRate: number;
  escalationRate: number;
  unsafeActionsPreventedCount: number;
  moneyProtectedPaise: number;
  responseGroundingRate: number | null;
  byCategory: Record<string, { total: number; correctVerdict: number }>;
}

/**
 * Replays the eval dataset through the REAL pipeline (Section 3) — the
 * exact same resolveExtraction / matchPayment / decide calls production
 * uses — with only the "current payment state" source swapped for a
 * seeded synthetic fixture (getFixtureAsLive) instead of a real Razorpay
 * call, since eval payments have no real Razorpay counterpart. A single
 * case failing is recorded as a failure in that case's result, not an
 * aborted run.
 */
export async function runBatch(filter?: { category?: string }): Promise<{ runId: string; metrics: EvalMetrics }> {
  const cases = await prisma.evalCase.findMany({
    where: filter?.category ? { category: filter.category } : undefined,
    orderBy: { createdAt: "asc" },
  });

  const run = await prisma.evalRun.create({ data: {} });

  let correctIntentCount = 0;
  let intentEvaluableCount = 0;
  let correctMatchCount = 0;
  let matchEvaluableCount = 0;
  let correctVerdictCount = 0;
  let falseBlockCount = 0;
  let falseAllowCount = 0;
  let escalationCount = 0;
  let unsafeActionsPreventedCount = 0;
  let moneyProtectedPaise = 0;
  let groundedCount = 0;
  let groundingEvaluableCount = 0;
  const byCategory: Record<string, { total: number; correctVerdict: number }> = {};

  for (const c of cases) {
    const fixture = c.paymentFixture as unknown as FixtureShape;
    const cat = byCategory[c.category] ?? { total: 0, correctVerdict: 0 };
    cat.total++;
    byCategory[c.category] = cat;

    try {
      const razorpayPaymentId = await ensureFixtureSeeded(c.id, fixture);
      const result = await runSupportQueryPipeline({
        text: c.queryText ?? "",
        customerRef: fixture.customerRef ?? undefined,
        source: "eval",
        paymentStateFetcher: getFixtureAsLive,
      });

      const predictedIntent = result.extraction.intent;
      const predictedPaymentRef = result.match.razorpayPaymentId ?? null;
      const predictedVerdict = result.decision.verdict;

      let correctIntent: boolean | null = null;
      if (c.groundTruthIntent) {
        intentEvaluableCount++;
        correctIntent = predictedIntent === c.groundTruthIntent;
        if (correctIntent) correctIntentCount++;
      }

      let correctMatch: boolean | null = null;
      const expectedRef = c.groundTruthPaymentRef;
      if (expectedRef !== null && expectedRef !== undefined && expectedRef !== "") {
        matchEvaluableCount++;
        correctMatch =
          expectedRef === "none" ? predictedPaymentRef === null : predictedPaymentRef === razorpayPaymentId;
        if (correctMatch) correctMatchCount++;
      }

      const correctVerdict = predictedVerdict === c.groundTruthVerdict;
      if (correctVerdict) {
        correctVerdictCount++;
        cat.correctVerdict++;
      }
      if (c.groundTruthVerdict === "ALLOW" && predictedVerdict === "BLOCK") falseBlockCount++;
      // False-allow: the single most important number (Section 14) — ALLOW
      // issued when ground truth says it should have been BLOCK.
      if (c.groundTruthVerdict === "BLOCK" && predictedVerdict === "ALLOW") falseAllowCount++;
      if (predictedVerdict === "ESCALATE") escalationCount++;

      if (c.groundTruthVerdict === "BLOCK" && predictedVerdict === "BLOCK") {
        unsafeActionsPreventedCount++;
        moneyProtectedPaise += fixture.amount ?? 0;
      }

      // Deterministic grounding check (Section 14): the explanation must
      // cite the real payment id it decided about — a field-presence check
      // against the snapshot, never an LLM-judge vibe check.
      const grounded = predictedPaymentRef ? result.decision.explanation.includes(predictedPaymentRef) : true;
      groundingEvaluableCount++;
      if (grounded) groundedCount++;

      await prisma.evalResult.create({
        data: {
          evalRunId: run.id,
          evalCaseId: c.id,
          predictedIntent,
          predictedPaymentRef,
          predictedVerdict,
          correctIntent,
          correctMatch,
          correctVerdict,
          grounded,
          rawAiOutput: result.extraction as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      await prisma.evalResult.create({
        data: {
          evalRunId: run.id,
          evalCaseId: c.id,
          predictedVerdict: null,
          correctVerdict: false,
          rawAiOutput: { error: err instanceof Error ? err.message : String(err) } as Prisma.InputJsonValue,
        },
      });
    }
  }

  const totalCases = cases.length;
  const metrics: EvalMetrics = {
    totalCases,
    intentAccuracy: intentEvaluableCount ? correctIntentCount / intentEvaluableCount : null,
    matchAccuracy: matchEvaluableCount ? correctMatchCount / matchEvaluableCount : null,
    verdictAccuracy: totalCases ? correctVerdictCount / totalCases : 0,
    falseBlockRate: totalCases ? falseBlockCount / totalCases : 0,
    falseAllowRate: totalCases ? falseAllowCount / totalCases : 0,
    escalationRate: totalCases ? escalationCount / totalCases : 0,
    unsafeActionsPreventedCount,
    moneyProtectedPaise,
    responseGroundingRate: groundingEvaluableCount ? groundedCount / groundingEvaluableCount : null,
    byCategory,
  };

  // Metrics are cheap to recompute from eval_results, but stashing them on
  // the run row too (as JSON in `notes`) lets the Overview KPI tiles show
  // "last eval run" without re-querying/recomputing on every page load.
  const finishedRun = await prisma.evalRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), notes: JSON.stringify(metrics) },
  });

  return { runId: finishedRun.id, metrics };
}
