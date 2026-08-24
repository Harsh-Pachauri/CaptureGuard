import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import { confirmAndExecute } from "@/lib/action-guard/actionGuard";

/**
 * Human confirms an ALLOW action. This is the only ordinary-path call that
 * reaches Razorpay's mutation API.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const agentId = typeof (body as { agentId?: unknown })?.agentId === "string"
    ? (body as { agentId: string }).agentId
    : "unknown-agent";

  const result = await confirmAndExecute(id, agentId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, action: "action" in result ? result.action : undefined },
      { status: result.status }
    );
  }
  return NextResponse.json(result);
}
