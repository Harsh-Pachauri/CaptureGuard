import { prisma } from "@/lib/db/client";
import { createRefund, capturePayment } from "@/lib/razorpay/mutationClient";
import * as auditService from "@/lib/audit/auditService";
import type { Prisma } from "@prisma/client";

// This file, plus lib/razorpay/mutationClient.ts, are the ONLY two files in
// the codebase permitted to cause real money movement. Every path below
// re-checks the decision's verdict server-side — never trusts that a prior
// check (e.g. a greyed-out UI button) still holds (Section 12 #10).

export type ActionType = "refund" | "compensate" | "capture" | "none";

interface ErrorResult {
  error: string;
  status: number;
}

/**
 * An action's state change and the audit row that documents it are written
 * in the same transaction (Section 3): "an action must not be considered
 * executed if its audit row failed to write."
 */
async function updateActionWithAudit(
  actionId: string,
  data: Prisma.ActionUpdateInput,
  audit: { eventType: auditService.AuditEventType; detail: Record<string, unknown> }
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.action.update({ where: { id: actionId }, data });
    await auditService.record(
      { eventType: audit.eventType, refTable: "actions", refId: actionId, detail: audit.detail },
      tx
    );
    return updated;
  });
}

async function createActionWithAudit(
  data: Prisma.ActionCreateInput,
  audit: { eventType: auditService.AuditEventType; detail: Record<string, unknown> }
) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.action.create({ data });
    await auditService.record(
      { eventType: audit.eventType, refTable: "actions", refId: created.id, detail: audit.detail },
      tx
    );
    return created;
  });
}

/**
 * Entry point for POST /api/actions. Creates the Action row and, for a
 * BLOCK verdict, refuses immediately — the mutation client is never called
 * on this path. For ALLOW, returns `requiresConfirmation: true` without
 * calling Razorpay; the real call only happens in confirmAndExecute.
 */
export async function attempt(input: {
  decisionId: string;
  actionType: ActionType;
  agentId: string;
}) {
  const decision = await prisma.decision.findUnique({ where: { id: input.decisionId } });
  if (!decision) return { error: "Decision not found", status: 404 } satisfies ErrorResult;

  if (decision.verdict === "BLOCK") {
    const action = await createActionWithAudit(
      { decision: { connect: { id: decision.id } }, actionType: input.actionType, state: "blocked", agentId: input.agentId },
      { eventType: "action_blocked", detail: { ruleId: decision.ruleId, explanation: decision.explanation } }
    );
    return { error: decision.explanation, status: 409, action };
  }

  const action = await createActionWithAudit(
    { decision: { connect: { id: decision.id } }, actionType: input.actionType, state: "pending", agentId: input.agentId },
    { eventType: "decision_made", detail: { verdict: decision.verdict, ruleId: decision.ruleId } }
  );

  return { action, requiresConfirmation: decision.verdict === "ALLOW" };
}

/**
 * POST /api/actions/:id/confirm — the only call in the whole app that can
 * result in Razorpay's real Refunds API being invoked on the ordinary
 * (non-override) path.
 */
export async function confirmAndExecute(actionId: string, agentId: string) {
  void agentId; // recorded on the action at creation time; kept in the signature for API symmetry with override()
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    include: { decision: true },
  });
  if (!action) return { error: "Action not found", status: 404 } satisfies ErrorResult;

  if (action.decision.verdict !== "ALLOW") {
    await auditService.record({
      eventType: "override_attempted",
      refTable: "actions",
      refId: action.id,
      detail: { note: "confirm called on a non-ALLOW decision", verdict: action.decision.verdict },
    });
    return {
      error:
        "This decision is not ALLOW, so it cannot be confirmed directly. Use the override endpoint with a reason if this is truly required.",
      status: 409,
    } satisfies ErrorResult;
  }

  if (action.state !== "pending") {
    return { error: `Action is already in state "${action.state}"`, status: 409 } satisfies ErrorResult;
  }

  return executeMutation(action.id, action.actionType as ActionType, action.decision, false);
}

/**
 * POST /api/actions/:id/override — the only way to proceed past a BLOCK.
 * Requires a non-empty typed reason, is itself an audited event
 * (override_recorded), and only then attempts the real Razorpay call —
 * never silent, never automatic.
 */
export async function override(actionId: string, agentId: string, reason: string) {
  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < 5) {
    return {
      error: "A reason (at least 5 characters) is required to override a BLOCK.",
      status: 400,
    } satisfies ErrorResult;
  }

  const action = await prisma.action.findUnique({
    where: { id: actionId },
    include: { decision: true },
  });
  if (!action) return { error: "Action not found", status: 404 } satisfies ErrorResult;

  if (action.decision.verdict !== "BLOCK") {
    return { error: "Override is only valid for a BLOCKed decision.", status: 400 } satisfies ErrorResult;
  }

  if (action.state === "executed" || action.state === "overridden") {
    return { error: `Action is already in state "${action.state}"`, status: 409 } satisfies ErrorResult;
  }

  await updateActionWithAudit(
    action.id,
    { state: "overridden", overrideReason: trimmedReason },
    {
      eventType: "override_recorded",
      detail: {
        agentId,
        reason: trimmedReason,
        ruleId: action.decision.ruleId,
        explanation: action.decision.explanation,
      },
    }
  );

  return executeMutation(action.id, action.actionType as ActionType, action.decision, true);
}

async function executeMutation(
  actionId: string,
  actionType: ActionType,
  decision: { paymentSnapshot: unknown },
  wasOverridden: boolean
) {
  if (actionType === "none") {
    const updated = await updateActionWithAudit(
      actionId,
      { state: "executed", executedAt: new Date() },
      { eventType: "action_executed", detail: { actionType: "none", overridden: wasOverridden } }
    );
    return { action: updated };
  }

  const snapshot = decision.paymentSnapshot as {
    razorpayPaymentId?: string;
    amount?: number;
    currency?: string;
  };
  const razorpayPaymentId = snapshot.razorpayPaymentId;
  if (!razorpayPaymentId) {
    const failed = await updateActionWithAudit(
      actionId,
      { state: "failed" },
      { eventType: "action_failed", detail: { error: "payment_snapshot missing razorpayPaymentId", overridden: wasOverridden } }
    );
    return { action: failed, error: "Payment snapshot is missing a Razorpay payment id.", status: 500 };
  }

  try {
    if (actionType === "capture") {
      // Capture-mirror: same file, same gateway, same re-check discipline as
      // the refund path above — amount/currency come from the live-fetched
      // snapshot the verdict was computed from, never from client input.
      if (typeof snapshot.amount !== "number" || !snapshot.currency) {
        const failed = await updateActionWithAudit(
          actionId,
          { state: "failed" },
          { eventType: "action_failed", detail: { error: "payment_snapshot missing amount/currency for capture", overridden: wasOverridden } }
        );
        return { action: failed, error: "Payment snapshot is missing amount/currency for capture.", status: 500 };
      }
      const captured = await capturePayment(razorpayPaymentId, {
        amount: snapshot.amount,
        currency: snapshot.currency,
      });
      const updated = await updateActionWithAudit(
        actionId,
        { state: "executed", executedAt: new Date() },
        {
          eventType: "action_executed",
          detail: { razorpayPaymentId, capturedStatus: captured.status, capturedAmount: captured.amount, overridden: wasOverridden },
        }
      );
      return { action: updated };
    }

    const refund = await createRefund(razorpayPaymentId);
    const updated = await updateActionWithAudit(
      actionId,
      { state: "executed", razorpayRefundId: refund.id, executedAt: new Date() },
      { eventType: "action_executed", detail: { razorpayRefundId: refund.id, razorpayPaymentId, overridden: wasOverridden } }
    );
    return { action: updated };
  } catch (err) {
    // Never silently retried (Section 3/12): a failed mutation call is
    // marked failed and surfaced, not retried automatically.
    const message = err instanceof Error ? err.message : String(err);
    const failed = await updateActionWithAudit(
      actionId,
      { state: "failed" },
      { eventType: "action_failed", detail: { error: message, razorpayPaymentId, overridden: wasOverridden } }
    );
    return { action: failed, error: message, status: 502 };
  }
}
