import { prisma } from "@/lib/db/client";
import type { Prisma, PrismaClient } from "@prisma/client";

// Append-only by convention: no update/delete helper is exported from this
// module, and application code should never call auditEvent.update /
// auditEvent.delete directly (Section 13 — enforced at the code-review
// level for this MVP, a stated limitation, not a claim of DB-level
// enforcement).
export type AuditEventType =
  | "decision_made"
  | "action_executed"
  | "action_blocked"
  | "action_failed"
  | "override_attempted"
  | "override_recorded"
  | "sync_failure"
  | "ai_failure"
  | "ai_output_invalid"
  | "payment_match_failed"
  | "low_confidence_escalation"
  | "webhook_duplicate_ignored"
  | "webhook_signature_invalid"
  | "webhook_malformed_payload"
  | "invalid_state_transition_rejected"
  | "payment_state_reconciled"
  | "payment_state_changed_mid_flow"
  | "razorpay_api_timeout"
  | "razorpay_api_unavailable";

export interface AuditRecordInput {
  eventType: AuditEventType | string;
  refTable: string;
  refId: string;
  detail: Record<string, unknown>;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Writes one append-only audit row. Accepts an optional transaction client
 * (`tx`) so callers can write the audit row in the SAME transaction as the
 * action/decision state change it documents — Section 3: "an action must
 * not be considered executed if its audit row failed to write."
 */
export async function record(input: AuditRecordInput, db: Db = prisma) {
  return db.auditEvent.create({
    data: {
      eventType: input.eventType,
      refTable: input.refTable,
      refId: input.refId,
      detail: input.detail as Prisma.InputJsonValue,
    },
  });
}

export interface AuditQueryFilters {
  eventType?: string;
  refTable?: string;
  refId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function query(filters: AuditQueryFilters) {
  const where: Prisma.AuditEventWhereInput = {};
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.refTable) where.refTable = filters.refTable;
  if (filters.refId) where.refId = filters.refId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  return prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 100, 500),
  });
}
