import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { override } from "@/lib/action-guard/actionGuard";

/**
 * Human overrides a BLOCK. Requires a non-empty typed reason (Section 5);
 * itself an audited event, and the only way past a BLOCK.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as { agentId?: unknown; reason?: unknown };
  const agentId = typeof input.agentId === "string" ? input.agentId : null;
  const reason = typeof input.reason === "string" ? input.reason : "";

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  if (!reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const result = await override(id, agentId, reason);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, action: "action" in result ? result.action : undefined },
      { status: result.status }
    );
  }
  return NextResponse.json(result);
}
