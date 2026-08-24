import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";
import { getLive } from "@/lib/payment-state/service";
import * as auditService from "@/lib/audit/auditService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const payment =
    (await prisma.payment.findUnique({ where: { id } })) ??
    (await prisma.payment.findUnique({ where: { razorpayPaymentId: id } }));

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const before = payment.status;
  const result = await getLive(payment.razorpayPaymentId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  const changed = before !== updated?.status;

  if (changed) {
    await auditService.record({
      eventType: "payment_state_reconciled",
      refTable: "payments",
      refId: payment.id,
      detail: { from: before, to: updated?.status },
    });
  }

  return NextResponse.json({ payment: updated, changed });
}
