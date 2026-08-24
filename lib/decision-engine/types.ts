export type PaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "auto_reversed"
  | "unknown";

export type RequestedAction =
  | "refund"
  | "compensate"
  | "status_check"
  | "other";

export type Verdict = "ALLOW" | "BLOCK" | "ESCALATE";

/**
 * Every field the Decision Engine needs to produce a verdict. Deliberately
 * flat and JSON-serializable (no class instances) so the exact same object
 * can be persisted as decisions.payment_snapshot for the audit trail.
 *
 * This is a pure-data contract: the engine that consumes it has zero I/O.
 */
export interface DecisionInput {
  razorpayPaymentId: string;
  status: PaymentStatus;
  captured: boolean;
  amount: number; // paise
  currency: string;
  razorpayCreatedAt: string; // ISO 8601 — kept as string for clean JSON snapshotting
  now: string; // ISO 8601 — the instant the decision is evaluated at
  autoReversalWindowHours: number;
  requestedAction: RequestedAction;
  matchConfidence: number | null; // null = no match found at all
  matchThreshold: number;
  sourceAvailable: boolean; // false = the live Razorpay fetch failed/timed out
  existingRefundOnRecord: boolean;
}

export interface Decision {
  verdict: Verdict;
  ruleId: string; // "R0".."R8"
  explanation: string;
  groundedFields: Record<string, unknown>;
}
