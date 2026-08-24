import { NextResponse, type NextRequest } from "next/server";
import { getSessionForRequest, scratchResponse } from "@/lib/auth/session";

/**
 * Shared bearer-token check for every /api/* route except the webhook
 * receiver (Section 13), which is authenticated by Razorpay's own HMAC
 * signature instead. Returns a NextResponse to short-circuit with if the
 * request is unauthorized, or null if it may proceed.
 *
 * Kept as the server-to-server auth path (scripts, CI, direct API callers)
 * per the migration requirement: INTERNAL_API_TOKEN may remain available
 * outside the browser. checkApiAuth below is what routes now call.
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

/**
 * The check every protected route now calls: a valid browser session
 * cookie OR the existing bearer token, either is sufficient. The browser
 * never sends INTERNAL_API_TOKEN — the session cookie is read straight off
 * the request, no header needed on that path.
 */
export async function checkApiAuth(req: NextRequest): Promise<NextResponse | null> {
  const session = await getSessionForRequest(req, scratchResponse());
  if (session.isLoggedIn) return null;

  return checkBearerAuth(req);
}
