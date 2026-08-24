import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const cases = await prisma.evalCase.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ cases });
}
