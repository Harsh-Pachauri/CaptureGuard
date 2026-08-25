import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import type { SessionData } from "@/lib/auth/session";

// Optimistic check only (Next's own authentication guide: "avoid database
// checks to prevent performance issues" here) — the real enforcement is
// server-side in the (dashboard)/dev layouts (page navigation) and
// checkApiAuth (API routes). This exists specifically because layouts don't
// always re-run their check on client-side soft navigation between two
// already-rendered dashboard routes; Proxy runs on every request.
//
// "/" is the public landing page (unauthenticated, pre-login) — the
// dashboard home lives at "/overview" instead. "/test-lab" is included so a
// judge session (and admin) must be logged in to reach it, same as every
// other dashboard route.
const PROTECTED_PREFIXES = ["/overview", "/inbox", "/payments", "/audit", "/eval", "/admin", "/dev", "/test-lab"];

// Judge Demo sessions (role: "judge" — see lib/auth/session.ts) may reach
// every protected prefix above EXCEPT these. Kept as its own list rather
// than editing PROTECTED_PREFIXES's meaning, so removing the Judge Demo
// later is just deleting this block and the judge-only branches below.
const ADMIN_ONLY_PREFIXES = ["/admin"];

async function readSession(req: NextRequest): Promise<{ loggedIn: boolean; role?: SessionData["role"] }> {
  const sealed = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const password = process.env.SESSION_SECRET;
  if (!sealed || !password || password.length < 32) return { loggedIn: false };
  try {
    const data = await unsealData<SessionData>(sealed, { password });
    return { loggedIn: Boolean(data.isLoggedIn), role: data.role };
  } catch {
    return { loggedIn: false };
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { loggedIn, role } = await readSession(req);
  const isJudge = loggedIn && role === "judge";

  if (pathname === "/login") {
    if (loggedIn) return NextResponse.redirect(new URL(isJudge ? "/test-lab" : "/overview", req.url));
    return NextResponse.next();
  }

  // "/judge" is the Judge Demo's own entry point (parallel to "/login") —
  // same already-logged-in redirect shape, just routed to each role's home.
  if (pathname === "/judge") {
    if (loggedIn) return NextResponse.redirect(new URL(isJudge ? "/test-lab" : "/overview", req.url));
    return NextResponse.next();
  }

  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminOnly && isJudge) {
    return NextResponse.redirect(new URL("/test-lab", req.url));
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isProtected && !loggedIn) {
    // Send an unauthenticated judge-flow visit back to the judge entry
    // point rather than the admin login page they have no password for.
    const dest = pathname.startsWith("/test-lab") ? "/judge" : "/login";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
