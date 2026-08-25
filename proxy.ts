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
// dashboard home lives at "/overview" instead.
const PROTECTED_PREFIXES = ["/overview", "/inbox", "/payments", "/audit", "/eval", "/admin", "/dev"];

async function isLoggedIn(req: NextRequest): Promise<boolean> {
  const sealed = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const password = process.env.SESSION_SECRET;
  if (!sealed || !password || password.length < 32) return false;
  try {
    const data = await unsealData<SessionData>(sealed, { password });
    return Boolean(data.isLoggedIn);
  } catch {
    return false;
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const loggedIn = await isLoggedIn(req);

  if (pathname === "/login") {
    if (loggedIn) return NextResponse.redirect(new URL("/overview", req.url));
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isProtected && !loggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
