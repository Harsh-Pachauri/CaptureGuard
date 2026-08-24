import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";
import { getLive } from "@/lib/payment-state/service";

/**
 * Triggers a live re-fetch by default (?live=false to skip for a cheap
 * cached read). If the live re-fetch fails, still returns cached data with
 * stale: true rather than a hard failure — this is a read-only detail view,
 * distinct from the Decision Engine's own live-fetch requirement, which
 * does hard-fail to ESCALATE (Section 5).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const live = searchParams.get("live") !== "false";

  let payment =
    (await prisma.payment.findUnique({ where: { id } })) ??
    (await prisma.payment.findUnique({ where: { razorpayPaymentId: id } }));

  let stale = false;

  if (!payment && id.startsWith("pay_")) {
    // A real Razorpay payment id we haven't seen via webhook yet (e.g. a
    // demo checkout just completed with no local webhook registered) —
    // adopt it via a live fetch rather than 404ing on a payment that
    // genuinely exists at Razorpay.
    const result = await getLive(id);
    if (result.ok) {
      payment = await prisma.payment.findUnique({ where: { id: result.dbId } });
    } else {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
  }

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (live) {
    const result = await getLive(payment.razorpayPaymentId);
    if (result.ok) {
      payment = await prisma.payment.findUnique({ where: { id: payment.id } });
    } else {
      stale = true;
    }
  }

  const paymentId = payment!.id;
  const [timeline, decisions, actions] = await Promise.all([
    prisma.webhookEvent.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } }),
    prisma.decision.findMany({ where: { paymentId }, orderBy: { createdAt: "desc" } }),
    prisma.action.findMany({
      where: { decision: { paymentId } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ payment, timeline, decisions, actions, stale });
}
