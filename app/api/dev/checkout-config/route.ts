import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";

/**
 * Serves only the Razorpay Key ID (never the Key Secret — Section 13) to
 * the dev checkout helper page so it can open Razorpay's real Checkout
 * widget for a given order. Bearer-protected like every other dashboard
 * endpoint; this is a local development convenience, not a public route.
 */
export async function GET(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return NextResponse.json({ error: "RAZORPAY_KEY_ID is not configured" }, { status: 500 });
  }
  return NextResponse.json({ keyId });
}
