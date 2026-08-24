import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMerchant } from "@/lib/db/merchant";
import { getLive, type GetLiveResult } from "@/lib/payment-state/service";
import { decide } from "@/lib/decision-engine/engine";
import type { Decision, DecisionInput, PaymentStatus } from "@/lib/decision-engine/types";
import * as auditService from "@/lib/audit/auditService";

export type PaymentStateFetcher = (razorpayPaymentId: string) => Promise<GetLiveResult>;

const ALREADY_RESOLVED: PaymentStatus[] = ["refunded", "partially_refunded", "auto_reversed"];

export interface RunCaptureRequestInput {
  razorpayPaymentId: string;
  agentId: string;
  paymentStateFetcher?: PaymentStateFetcher;
}

export interface CaptureRequestResult {
  decision: Decision;
  decisionDbId: string | null;
}

/**
 * Capture-mirror's decision-only entry point — a sibling to
 * runSupportQueryPipeline (lib/pipeline/runSupportQuery.ts), not a
 * modification of it. Deliberately skips AI extraction and fuzzy matching:
 * capture is a merchant operational action naming an exact payment id, not
 * something inferred from customer support text, so matchConfidence is the
 * trivial 1.0 case and R1 passes for the same reason a status_check with an
 * exact reference would.
 *
 * Everything downstream — the mandatory live fetch, the pure decide() call,
 * persistence — is the same machinery the support-query pipeline uses. This
 * function only ever creates a Decision row; it never mutates anything.
 * lib/action-guard remains the only path that can call a Razorpay mutation
 * endpoint.
 */
export async function runCaptureRequest(input: RunCaptureRequestInput): Promise<CaptureRequestResult> {
  const fetchPaymentState = input.paymentStateFetcher ?? getLive;
  const merchant = await getMerchant();

  const paymentRowBefore = await prisma.payment.findUnique({
    where: { razorpayPaymentId: input.razorpayPaymentId },
  });
  const live = await fetchPaymentState(input.razorpayPaymentId);
  const paymentRow =
    (live.ok
      ? await prisma.payment.findUnique({ where: { id: live.dbId } })
      : paymentRowBefore) ?? paymentRowBefore;

  if (!paymentRow) {
    // No local record at all and the live fetch also failed — there is no
    // PaymentRecord for decide() to reason about and payment_id is a
    // required FK on decisions, so this is reported directly rather than
    // persisted, exactly like runSupportQueryPipeline's no-match case.
    return {
      decision: {
        verdict: "ESCALATE",
        ruleId: "R0",
        explanation:
          `Could not verify payment ${input.razorpayPaymentId} — no local record and the live Razorpay fetch ` +
          `failed. Never guessing on a money-adjacent decision — flagging for a human to check the Razorpay ` +
          `Dashboard directly.`,
        groundedFields: { razorpayPaymentId: input.razorpayPaymentId },
      },
      decisionDbId: null,
    };
  }

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
        requestedAction: "capture",
        matchConfidence: 1,
        matchThreshold: merchant.matchConfidenceThreshold,
        sourceAvailable: true,
        existingRefundOnRecord: ALREADY_RESOLVED.includes(live.payment.status),
      }
    : {
        // Live fetch failed — R0 fires regardless of the rest of these
        // fields (mirrors runSupportQueryPipeline's identical fallback).
        razorpayPaymentId: paymentRow.razorpayPaymentId,
        status: paymentRow.status as PaymentStatus,
        captured: paymentRow.captured,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        razorpayCreatedAt: paymentRow.razorpayCreatedAt.toISOString(),
        now: new Date().toISOString(),
        autoReversalWindowHours: merchant.autoReversalWindowHours,
        requestedAction: "capture",
        matchConfidence: 1,
        matchThreshold: merchant.matchConfidenceThreshold,
        sourceAvailable: false,
        existingRefundOnRecord: ALREADY_RESOLVED.includes(paymentRow.status as PaymentStatus),
      };

  const decision = decide(decisionInput);

  const decisionRow = await prisma.decision.create({
    data: {
      paymentId: paymentRow.id,
      requestedAction: decisionInput.requestedAction,
      verdict: decision.verdict,
      ruleId: decision.ruleId,
      explanation: decision.explanation,
      paymentSnapshot: decisionInput as unknown as Prisma.InputJsonValue,
    },
  });

  await auditService.record({
    eventType: "decision_made",
    refTable: "decisions",
    refId: decisionRow.id,
    detail: { verdict: decision.verdict, ruleId: decision.ruleId, requestedAction: "capture", agentId: input.agentId },
  });

  return { decision, decisionDbId: decisionRow.id };
}
