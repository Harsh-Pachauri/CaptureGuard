import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { getSessionForRequest } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedHash) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_PASSWORD_HASH is not set" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = typeof (body as { password?: unknown })?.password === "string"
    ? (body as { password: string }).password
    : "";

  if (!password || !verifyPassword(password, expectedHash)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ status: "ok" });
  const session = await getSessionForRequest(req, res);
  session.isLoggedIn = true;
  await session.save();
  return res;
}
