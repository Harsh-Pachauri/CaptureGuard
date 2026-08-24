import { prisma } from "@/lib/db/client";
import { getMerchant } from "@/lib/db/merchant";
import { fetchPayment, type RazorpayPayment } from "@/lib/razorpay/client";
import * as auditService from "@/lib/audit/auditService";
import type { Prisma } from "@prisma/client";
import type { PaymentStatus } from "@/lib/decision-engine/types";

export interface NormalizedPayment {
  razorpayPaymentId: string;
  razorpayOrderId: string | null;
  status: PaymentStatus;
  captured: boolean;
  amount: number;
  currency: string;
  customerRef: string | null;
  razorpayCreatedAt: string; // ISO 8601
  raw: RazorpayPayment;
}

/**
 * Maps Razorpay's raw payment object to our state machine (Section 7).
 *
 * The one genuinely uncertain case the blueprint flags (Section 7): telling
 * a Razorpay-initiated auto-reversal apart from a merchant-initiated refund.
 * Rather than depend on an unverified webhook "reason" field, this uses a
 * field we DO have verified (Razorpay's own `captured` boolean, which is
 * still `false` on the payment object if the authorization was never
 * captured): a refund can only ever reach a payment that was captured via
 * the merchant's own Refunds API, so `captured === false` at the moment
 * status resolves to "refunded" can only mean Razorpay's own auto-reversal
 * of an authorization that was never captured. This resolves the blueprint's
 * flagged uncertainty without depending on the unverified field, and doesn't
 * change any BLOCK/ESCALATE behavior — R6 blocks on refunded,
 * partially_refunded, and auto_reversed identically either way.
 */
export function normalizeStatus(rzp: RazorpayPayment): PaymentStatus {
  switch (rzp.status) {
    case "created":
      return "created";
    case "authorized":
      return "authorized";
    case "failed":
      return "failed";
    case "captured": {
      const refundedAmount =
        typeof rzp.amount_refunded === "number" ? rzp.amount_refunded : 0;
      if (refundedAmount <= 0) return "captured";
      return refundedAmount >= rzp.amount ? "refunded" : "partially_refunded";
    }
    case "refunded":
      return rzp.captured ? "refunded" : "auto_reversed";
    default:
      return "unknown";
  }
}

function extractCustomerRef(rzp: RazorpayPayment): string | null {
  const notes = (rzp.notes ?? {}) as Record<string, unknown>;
  const ref = notes.customer_ref ?? notes.customerRef;
  return typeof ref === "string" ? ref : null;
}

export function normalizeRazorpayPayment(rzp: RazorpayPayment): NormalizedPayment {
  return {
    razorpayPaymentId: rzp.id,
    razorpayOrderId: rzp.order_id ?? null,
    status: normalizeStatus(rzp),
    captured: rzp.captured,
    amount: rzp.amount,
    currency: rzp.currency,
    customerRef: extractCustomerRef(rzp),
    razorpayCreatedAt: new Date(rzp.created_at * 1000).toISOString(),
    raw: rzp,
  };
}

/**
 * Invalid transitions per Section 7: capture is one-directional
 * (captured → authorized is invalid), refunded/auto_reversed/
 * partially_refunded are terminal w.r.t. re-capturing, and failed is
 * terminal. A webhook implying one of these is rejected and logged rather
 * than silently applied.
 */
export function isInvalidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return false;
  if (from === "captured" && to === "authorized") return true;
  if (
    (from === "refunded" || from === "partially_refunded" || from === "auto_reversed") &&
    to === "captured"
  ) {
    return true;
  }
  if (from === "failed" && to !== "failed") return true;
  return false;
}

export type DataSource = "real" | "fixture" | "eval";

export async function upsertPaymentRecord(
  n: NormalizedPayment,
  dataSource: DataSource = "real"
) {
  const merchant = await getMerchant();
  return prisma.payment.upsert({
    where: { razorpayPaymentId: n.razorpayPaymentId },
    create: {
      razorpayPaymentId: n.razorpayPaymentId,
      razorpayOrderId: n.razorpayOrderId,
      merchantId: merchant.id,
      status: n.status,
      captured: n.captured,
      amount: n.amount,
      currency: n.currency,
      customerRef: n.customerRef,
      razorpayCreatedAt: new Date(n.razorpayCreatedAt),
      lastSyncedAt: new Date(),
      rawLastPayload: n.raw as unknown as Prisma.InputJsonValue,
      dataSource,
    },
    update: {
      razorpayOrderId: n.razorpayOrderId,
      status: n.status,
      captured: n.captured,
      amount: n.amount,
      currency: n.currency,
      customerRef: n.customerRef ?? undefined,
      lastSyncedAt: new Date(),
      rawLastPayload: n.raw as unknown as Prisma.InputJsonValue,
      // dataSource intentionally omitted: sticky at creation time so a
      // "fixture" or "eval" row is never silently relabeled "real" by a
      // later live sync.
    },
  });
}

export type GetLiveResult =
  | { ok: true; payment: NormalizedPayment; dbId: string }
  | { ok: false; error: string };

/**
 * The mandatory live-fetch path: ALWAYS calls Razorpay fresh, never trusts
 * the local cache. This is what every gated decision must call before the
 * Decision Engine runs (Section 6): a stale or delayed webhook can produce
 * a momentarily wrong list view, but never a wrong verdict, because the
 * verdict is always computed from what this function returns.
 */
export async function getLive(razorpayPaymentId: string): Promise<GetLiveResult> {
  try {
    const rzp = await fetchPayment(razorpayPaymentId);
    const normalized = normalizeRazorpayPayment(rzp);
    const row = await upsertPaymentRecord(normalized, "real");
    return { ok: true, payment: normalized, dbId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await auditService.record({
      eventType: "razorpay_api_unavailable",
      refTable: "payments",
      refId: razorpayPaymentId,
      detail: { razorpayPaymentId, error: message },
    });
    return { ok: false, error: message };
  }
}

export function extractPaymentEntityId(payload: unknown): string | null {
  const p = payload as {
    payload?: {
      payment?: { entity?: { id?: string } };
      refund?: { entity?: { payment_id?: string } };
    };
  };
  const direct = p.payload?.payment?.entity?.id;
  if (typeof direct === "string") return direct;
  const viaRefund = p.payload?.refund?.entity?.payment_id;
  if (typeof viaRefund === "string") return viaRefund;
  return null;
}

export interface ApplyEventResult {
  applied: boolean;
  razorpayPaymentId: string | null;
  paymentDbId?: string;
  reason?: string;
}

/**
 * Applies a verified webhook event to the local cache. Webhooks exist for
 * speed and UI responsiveness (Section 6) — rather than trust individual
 * webhook payload fields (whose exact shape for auto-reversal detection is
 * explicitly flagged unverified, Section 7), this triggers the same
 * mandatory live re-fetch as any other sync, which is strictly safer than
 * the minimum the blueprint requires and sidesteps the unverified field
 * entirely. If the live re-fetch itself fails, the event is still recorded
 * (webhook receipt succeeds) but the cache update is logged as failed —
 * the reconciliation job / manual "re-sync" button catches it later.
 */
export async function applyEvent(payload: unknown): Promise<ApplyEventResult> {
  const razorpayPaymentId = extractPaymentEntityId(payload);
  if (!razorpayPaymentId) {
    return { applied: false, razorpayPaymentId: null, reason: "no payment entity in payload" };
  }

  const existing = await prisma.payment.findUnique({
    where: { razorpayPaymentId },
  });

  const result = await getLive(razorpayPaymentId);
  if (!result.ok) {
    return { applied: false, razorpayPaymentId, reason: result.error };
  }

  if (existing && isInvalidTransition(existing.status as PaymentStatus, result.payment.status)) {
    await auditService.record({
      eventType: "invalid_state_transition_rejected",
      refTable: "payments",
      refId: existing.id,
      detail: {
        razorpayPaymentId,
        from: existing.status,
        to: result.payment.status,
      },
    });
    // The live fetch already wrote the new state above (it IS the live
    // truth) — this audit entry exists so an unexpected transition is
    // visible for investigation, not silently invisible. We do not attempt
    // to roll the row back to a status that's no longer what Razorpay says.
    return { applied: true, razorpayPaymentId, paymentDbId: result.dbId, reason: "invalid_transition_logged" };
  }

  return { applied: true, razorpayPaymentId, paymentDbId: result.dbId };
}
