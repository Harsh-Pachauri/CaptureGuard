import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const query = await prisma.supportQuery.findUnique({
    where: { id },
    include: {
      matchedPayment: true,
      decisions: { include: { actions: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!query) {
    return NextResponse.json({ error: "Support query not found" }, { status: 404 });
  }

  return NextResponse.json({
    query,
    extraction: query.aiExtraction,
    match: {
      matched: Boolean(query.matchedPaymentId),
      paymentDbId: query.matchedPaymentId,
      matchConfidence: query.matchConfidence,
      matchMethod: query.matchMethod,
    },
    decision: query.decisions[0] ?? null,
  });
}
