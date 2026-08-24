import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const cases = await prisma.evalCase.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ cases });
}
