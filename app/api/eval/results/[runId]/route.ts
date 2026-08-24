import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { runId } = await params;
  const run = await prisma.evalRun.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: "Eval run not found" }, { status: 404 });
  }

  const results = await prisma.evalResult.findMany({
    where: { evalRunId: runId },
    include: { evalCase: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ run, results });
}
