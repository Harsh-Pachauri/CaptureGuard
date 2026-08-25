import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export interface SessionData {
  isLoggedIn: boolean;
  /**
   * Absent (undefined) for every existing admin session — those never set
   * this field, so `role !== "judge"` is what "has full/admin access"
   * means everywhere it's checked. Only app/api/auth/judge-login/route.ts
   * ever sets this to "judge"; lib/api/auth.ts#requireNonJudge and
   * proxy.ts read it to gate admin-only surfaces from judge sessions.
   */
  role?: "judge";
}

function sessionOptions() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters (e.g. `openssl rand -base64 32`)"
    );
  }
  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

/**
 * Server Components, layouts, Server Actions — the ambient next/headers
 * cookies() context. Not usable in Route Handlers called directly outside
 * a real Next.js request (as this repo's own tests do for every other
 * route — see webhook.test.ts, action-guard.test.ts): cookies() requires
 * Next's internal request-scoped async context, which direct invocation
 * doesn't establish. Route Handlers use getSessionForRequest below instead.
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function createSession(): Promise<void> {
  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/**
 * Route Handlers: works directly off the Request/Response pair (iron-session
 * supports this natively) instead of next/headers#cookies(). Reads the
 * session from `req`; `session.save()` appends Set-Cookie onto `res`'s own
 * headers, so callers must return that same `res`. This is what makes
 * session auth testable the same way every other route in this repo is
 * tested — no real Next.js server required.
 */
export async function getSessionForRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions());
}

/** A throwaway response object for read-only session checks (checkApiAuth) — its headers are never sent. */
export function scratchResponse(): NextResponse {
  return new NextResponse();
}
