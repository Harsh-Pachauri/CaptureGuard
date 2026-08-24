import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { createOrder } from "@/lib/razorpay/client";

/**
 * Demo/dev utility ONLY (Section 5): creates a real Razorpay Test Mode
 * order, optionally with payment_capture: 0, to seed demo/eval payments.
 * Never called from anything resembling a real storefront checkout flow.
 */
export async function POST(req: NextRequest) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as {
    amount?: unknown;
    currency?: unknown;
    capture_immediately?: unknown;
    notes?: unknown;
  };

  if (typeof input.amount !== "number" || !Number.isInteger(input.amount) || input.amount <= 0) {
    return NextResponse.json(
      { error: "amount (integer, paise, > 0) is required" },
      { status: 400 }
    );
  }

  try {
    const razorpayOrder = await createOrder({
      amount: input.amount,
      currency: typeof input.currency === "string" ? input.currency : undefined,
      capture_immediately: Boolean(input.capture_immediately),
      notes:
        typeof input.notes === "object" && input.notes !== null
          ? (input.notes as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json({ orderId: razorpayOrder.id, razorpayOrder });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
