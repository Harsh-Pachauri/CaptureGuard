import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { runBatch } from "@/lib/eval/runner";

export async function POST(req: NextRequest) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const input = body as { datasetFilter?: { category?: string } };

  const { runId, metrics } = await runBatch(input.datasetFilter);
  return NextResponse.json({ runId, metrics });
}
