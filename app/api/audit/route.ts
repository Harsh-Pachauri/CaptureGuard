import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import * as auditService from "@/lib/audit/auditService";

export async function GET(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const events = await auditService.query({
    eventType: searchParams.get("eventType") ?? undefined,
    refTable: searchParams.get("refTable") ?? undefined,
    refId: searchParams.get("refId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return NextResponse.json({ events });
}
