import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMerchant } from "@/lib/db/merchant";
import { resolveExtraction, type ExtractContext } from "@/lib/ai";
import type { IntentExtraction } from "@/lib/ai/schema";
import { matchPayment, type MatchResult } from "@/lib/matcher/paymentMatcher";
import { decide } from "@/lib/decision-engine/engine";
import type { Decision, DecisionInput, PaymentStatus, RequestedAction } from "@/lib/decision-engine/types";
import { getLive, type GetLiveResult } from "@/lib/payment-state/service";
import * as auditService from "@/lib/audit/auditService";

export type PaymentStateFetcher = (razorpayPaymentId: string) => Promise<GetLiveResult>;

/**
 * The single pipeline the support-query API route AND the evaluation
 * runner both call — never a separate copy (Section 3: "the eval harness
 * calls the exact same AIExtractionService/PaymentMatcher/DecisionEngine
 * code used in production... which is a common and easy way to accidentally
 * report a number the real system doesn't achieve").
 */

const ALREADY_RESOLVED: PaymentStatus[] = ["refunded", "partially_refunded", "auto_reversed"];

function mapRequestedAction(action: IntentExtraction["requested_action"]): RequestedAction {
  switch (action) {
    case "refund":
      return "refund";
    case "compensate":
      return "compensate";
    case "status_check":
      return "status_check";
    default:
      return "other";
  }
}

export interface PipelineResult {
  supportQueryId: string;
  extraction: IntentExtraction;
  extractionSource: "ai" | "fallback";
  aiError: string | null;
  match: MatchResult;
  decision: Decision;
  decisionDbId: string | null;
}

export interface RunPipelineInput {
  text: string;
  customerRef?: string;
  source: "demo" | "eval";
  /**
   * Defaults to the real live Razorpay fetch (getLive). The evaluation
   * runner (Section 3: "mocked Action Guard, no real Razorpay calls in eval
   * mode") injects a fixture-reading fetcher instead, since eval payments
   * are 100% synthetic and have no real Razorpay counterpart to check —
   * the fixture row IS the ground truth for that case. The Matcher and
   * Decision Engine calls below are identical either way; only where the
   * "current payment state" comes from changes.
   */
  paymentStateFetcher?: PaymentStateFetcher;
}

export async function runSupportQueryPipeline(input: RunPipelineInput): Promise<PipelineResult> {
  const fetchPaymentState = input.paymentStateFetcher ?? getLive;
  const merchant = await getMerchant();

  const context: ExtractContext | undefined = input.customerRef
    ? { customerRef: input.customerRef }
    : undefined;

  const resolved = await resolveExtraction(input.text, context, merchant.matchConfidenceThreshold);
  const { extraction, source: extractionSource, aiError } = resolved;

  const match = await matchPayment({ extraction, customerRef: input.customerRef });

  let decision: Decision;
  let decisionDbId: string | null = null;
  let matchedPaymentDbId: string | null = null;

  if (!match.matched || !match.razorpayPaymentId) {
    // No candidate payment at all — there is no PaymentRecord for the
    // Decision Engine to reason about (decide() requires one), so this
    // synthesizes the same R1 ESCALATE outcome the engine would produce.
    // No `decisions` row is persisted (payment_id is a required FK on that
    // table) — the escalation is fully recorded on the support_query and
    // in the audit trail instead.
    decision = {
      verdict: "ESCALATE",
      ruleId: "R1",
      explanation:
        match.reason ??
        "No confident payment match was found for this request. Please provide an explicit payment or order ID.",
      groundedFields: {
        matchConfidence: match.matchConfidence,
        matchThreshold: merchant.matchConfidenceThreshold,
        requestedAction: mapRequestedAction(extraction.requested_action),
      },
    };
  } else {
    const paymentRowBefore = await prisma.payment.findUnique({
      where: { razorpayPaymentId: match.razorpayPaymentId },
    });
    const live = await fetchPaymentState(match.razorpayPaymentId);
    const paymentRow =
      (live.ok
        ? await prisma.payment.findUnique({ where: { id: live.dbId } })
        : paymentRowBefore) ?? paymentRowBefore;
    matchedPaymentDbId = paymentRow?.id ?? null;

    const decisionInput: DecisionInput = live.ok
      ? {
          razorpayPaymentId: live.payment.razorpayPaymentId,
          status: live.payment.status,
          captured: live.payment.captured,
          amount: live.payment.amount,
          currency: live.payment.currency,
          razorpayCreatedAt: live.payment.razorpayCreatedAt,
          now: new Date().toISOString(),
          autoReversalWindowHours: merchant.autoReversalWindowHours,
          requestedAction: mapRequestedAction(extraction.requested_action),
          matchConfidence: match.matchConfidence,
          matchThreshold: merchant.matchConfidenceThreshold,
          sourceAvailable: true,
          existingRefundOnRecord: ALREADY_RESOLVED.includes(live.payment.status),
        }
      : {
          // Live fetch failed — R0 fires regardless of the rest of these
          // fields, but the object must still be well-typed. Best-effort
          // values come from our last cached row; sourceAvailable: false is
          // what actually drives the ESCALATE.
          razorpayPaymentId: paymentRow?.razorpayPaymentId ?? match.razorpayPaymentId,
          status: (paymentRow?.status as PaymentStatus | undefined) ?? "unknown",
          captured: paymentRow?.captured ?? false,
          amount: paymentRow?.amount ?? 0,
          currency: paymentRow?.currency ?? "INR",
          razorpayCreatedAt: paymentRow?.razorpayCreatedAt?.toISOString() ?? new Date().toISOString(),
          now: new Date().toISOString(),
          autoReversalWindowHours: merchant.autoReversalWindowHours,
          requestedAction: mapRequestedAction(extraction.requested_action),
          matchConfidence: match.matchConfidence,
          matchThreshold: merchant.matchConfidenceThreshold,
          sourceAvailable: false,
          existingRefundOnRecord: paymentRow
            ? ALREADY_RESOLVED.includes(paymentRow.status as PaymentStatus)
            : false,
        };

    decision = decide(decisionInput);

    if (matchedPaymentDbId) {
      const decisionRow = await prisma.decision.create({
        data: {
          paymentId: matchedPaymentDbId,
          requestedAction: decisionInput.requestedAction,
          verdict: decision.verdict,
          ruleId: decision.ruleId,
          explanation: decision.explanation,
          paymentSnapshot: decisionInput as unknown as Prisma.InputJsonValue,
        },
      });
      decisionDbId = decisionRow.id;
      await auditService.record({
        eventType: "decision_made",
        refTable: "decisions",
        refId: decisionRow.id,
        detail: { verdict: decision.verdict, ruleId: decision.ruleId },
      });
    }
  }

  const supportQuery = await prisma.supportQuery.create({
    data: {
      rawText: input.text,
      language: extraction.language,
      customerRef: input.customerRef,
      aiExtraction: extraction as unknown as Prisma.InputJsonValue,
      matchedPaymentId: matchedPaymentDbId ?? undefined,
      matchConfidence: match.matchConfidence,
      matchMethod: match.matchMethod,
      status: decision.verdict === "ESCALATE" ? "escalated" : "decided",
      source: input.source,
    },
  });

  if (decisionDbId) {
    await prisma.decision.update({
      where: { id: decisionDbId },
      data: { supportQueryId: supportQuery.id },
    });
  }

  if (!match.matched) {
    await auditService.record({
      eventType: "payment_match_failed",
      refTable: "support_queries",
      refId: supportQuery.id,
      detail: { reason: match.reason, extraction },
    });
  }
  if (extractionSource === "fallback" && aiError) {
    await auditService.record({
      eventType: "ai_failure",
      refTable: "support_queries",
      refId: supportQuery.id,
      detail: { error: aiError },
    });
  }
  if (extraction.confidence < merchant.matchConfidenceThreshold) {
    await auditService.record({
      eventType: "low_confidence_escalation",
      refTable: "support_queries",
      refId: supportQuery.id,
      detail: { confidence: extraction.confidence, threshold: merchant.matchConfidenceThreshold },
    });
  }

  return {
    supportQueryId: supportQuery.id,
    extraction,
    extractionSource,
    aiError,
    match,
    decision,
    decisionDbId,
  };
}
