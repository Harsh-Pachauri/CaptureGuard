import { NextResponse, type NextRequest } from "next/server";
import { getSessionForRequest } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ status: "ok" });
  const session = await getSessionForRequest(req, res);
  session.destroy();
  return res;
}
