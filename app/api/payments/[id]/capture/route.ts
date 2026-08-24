import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";
import { runCaptureRequest } from "@/lib/pipeline/runCaptureRequest";

/**
 * Capture-mirror's decision-creation route — the sibling to
 * POST /api/support-queries for the capture path. Like that route, this
 * only ever produces a Decision; it never calls Razorpay's mutation API
 * itself. The real capture only happens through the existing, unmodified
 * POST /api/actions → attempt → confirm/override gateway, using the
 * decisionId this returns.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const agentId =
    typeof (body as { agentId?: unknown })?.agentId === "string"
      ? (body as { agentId: string }).agentId
      : "unknown-agent";

  // Same id resolution as GET /api/payments/[id]: try a local row first
  // (by our internal id or by razorpayPaymentId), and if none exists yet,
  // fall through to treating `id` itself as a Razorpay payment id — a real
  // payment can genuinely have no local row at all (e.g. a failed checkout,
  // which the dev checkout page only syncs on its success handler).
  // runCaptureRequest's own mandatory live fetch is what actually resolves
  // and adopts it; this route must not gate on a local row existing first.
  const payment =
    (await prisma.payment.findUnique({ where: { id } })) ??
    (await prisma.payment.findUnique({ where: { razorpayPaymentId: id } }));

  if (!payment && !id.startsWith("pay_")) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const razorpayPaymentId = payment?.razorpayPaymentId ?? id;
  const result = await runCaptureRequest({ razorpayPaymentId, agentId });

  return NextResponse.json({
    decision: result.decision,
    decisionDbId: result.decisionDbId,
  });
}
