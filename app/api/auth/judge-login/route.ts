import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { getSessionForRequest } from "@/lib/auth/session";

/**
 * Separate from POST /api/auth/login on purpose — a distinct access code
 * (JUDGE_ACCESS_CODE_HASH), never the real ADMIN_PASSWORD_HASH, and the
 * resulting session is marked role: "judge" (see lib/auth/session.ts),
 * which every admin-only check (requireNonJudge, proxy.ts) uses to
 * restrict it. Structurally identical to the admin login route
 * otherwise — same hashPassword/verifyPassword, same session mechanism —
 * so it doesn't introduce a second auth system, just a second credential
 * and a role flag on the existing one.
 */
export async function POST(req: NextRequest) {
  const expectedHash = process.env.JUDGE_ACCESS_CODE_HASH;
  if (!expectedHash) {
    return NextResponse.json(
      { error: "Server misconfiguration: JUDGE_ACCESS_CODE_HASH is not set" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = typeof (body as { code?: unknown })?.code === "string" ? (body as { code: string }).code : "";

  if (!code || !verifyPassword(code, expectedHash)) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  const res = NextResponse.json({ status: "ok" });
  const session = await getSessionForRequest(req, res);
  session.isLoggedIn = true;
  session.role = "judge";
  await session.save();
  return res;
}
