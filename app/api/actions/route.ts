import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import { attempt, type ActionType } from "@/lib/action-guard/actionGuard";

export async function POST(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as { decisionId?: unknown; actionType?: unknown; agentId?: unknown };
  const decisionId = typeof input.decisionId === "string" ? input.decisionId : null;
  const actionType = input.actionType as ActionType;
  const agentId = typeof input.agentId === "string" ? input.agentId : null;

  if (!decisionId || !agentId || !["refund", "compensate", "none"].includes(actionType)) {
    return NextResponse.json(
      { error: "decisionId, agentId, and actionType (refund|compensate|none) are required" },
      { status: 400 }
    );
  }

  const result = await attempt({ decisionId, actionType, agentId });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, action: "action" in result ? result.action : undefined },
      { status: result.status }
    );
  }
  return NextResponse.json(result);
}
