import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared bearer-token check for every /api/* route except the webhook
 * receiver (Section 13), which is authenticated by Razorpay's own HMAC
 * signature instead. Returns a NextResponse to short-circuit with if the
 * request is unauthorized, or null if it may proceed.
 */
export function checkBearerAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfiguration: INTERNAL_API_TOKEN is not set" },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
