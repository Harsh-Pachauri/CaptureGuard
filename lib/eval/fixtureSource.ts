import { prisma } from "@/lib/db/client";
import type { GetLiveResult } from "@/lib/payment-state/service";
import type { PaymentStatus } from "@/lib/decision-engine/types";
import type { RazorpayPayment } from "@/lib/razorpay/client";

/**
 * Reads an already-seeded eval-tagged payment row as "live" state — no
 * network call, no real Razorpay dependency. For eval cases the fixture IS
 * the ground truth: there is no real Razorpay payment behind a pay_EVAL_*
 * id to check against. Passed as the pipeline's paymentStateFetcher only in
 * eval mode (lib/eval/runner.ts) — production always uses the real
 * lib/payment-state/service.getLive.
 */
export async function getFixtureAsLive(razorpayPaymentId: string): Promise<GetLiveResult> {
  const row = await prisma.payment.findUnique({ where: { razorpayPaymentId } });
  if (!row) {
    return { ok: false, error: `Eval fixture payment ${razorpayPaymentId} was not seeded` };
  }

  const raw: RazorpayPayment =
    (row.rawLastPayload as unknown as RazorpayPayment) ??
    ({
      id: row.razorpayPaymentId,
      entity: "payment",
      order_id: row.razorpayOrderId,
      status: row.status,
      captured: row.captured,
      amount: row.amount,
      currency: row.currency,
      created_at: Math.floor(row.razorpayCreatedAt.getTime() / 1000),
      notes: {},
    } satisfies RazorpayPayment);

  return {
    ok: true,
    dbId: row.id,
    payment: {
      razorpayPaymentId: row.razorpayPaymentId,
      razorpayOrderId: row.razorpayOrderId,
      status: row.status as PaymentStatus,
      captured: row.captured,
      amount: row.amount,
      currency: row.currency,
      customerRef: row.customerRef,
      razorpayCreatedAt: row.razorpayCreatedAt.toISOString(),
      raw,
    },
  };
}
