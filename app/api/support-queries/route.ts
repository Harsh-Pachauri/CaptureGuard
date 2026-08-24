import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { runSupportQueryPipeline } from "@/lib/pipeline/runSupportQuery";
import { prisma } from "@/lib/db/client";

/**
 * Lists submitted queries for the Support Inbox UI (Section 16). Not
 * separately itemized in Section 5's endpoint list, which only spells out
 * the POST here and GET /:id — this GET is the natural collection route the
 * Inbox screen needs and doesn't conflict with anything in the API
 * contract.
 */
export async function GET(req: NextRequest) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);

  const queries = await prisma.supportQuery.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { decisions: { orderBy: { createdAt: "desc" }, take: 1 }, matchedPayment: true },
  });

  return NextResponse.json({ queries });
}

/**
 * Submits a support query (demo UI or eval harness). Runs the full pipeline
 * synchronously and returns the end-to-end result in one call — this is
 * what the demo UI renders. Escalation is a valid, successful result
 * (200), not an error.
 */
export async function POST(req: NextRequest) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as { text?: unknown; customerRef?: unknown; source?: unknown };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 422 });
  }
  const source = input.source === "eval" ? "eval" : "demo";
  const customerRef = typeof input.customerRef === "string" ? input.customerRef : undefined;

  const result = await runSupportQueryPipeline({ text, customerRef, source });

  return NextResponse.json({
    queryId: result.supportQueryId,
    extraction: result.extraction,
    extractionSource: result.extractionSource,
    match: result.match,
    decision: result.decision,
  });
}
