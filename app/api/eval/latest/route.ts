import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";

/**
 * Not in Section 5's original list — a small additive convenience so the
 * Overview screen can show the last eval run's headline numbers (Section
 * 16: "a real computed sum from visible cases") without re-running the
 * batch on every page load.
 */
export async function GET(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const run = await prisma.evalRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
  });

  if (!run) {
    return NextResponse.json({ run: null, metrics: null });
  }

  let metrics = null;
  try {
    metrics = run.notes ? JSON.parse(run.notes) : null;
  } catch {
    metrics = null;
  }

  return NextResponse.json({ run, metrics });
}
