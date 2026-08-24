import { NextResponse, type NextRequest } from "next/server";
import { checkApiAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const authError = await checkApiAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Number(searchParams.get("offset") ?? 0) || 0;

  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: { razorpayCreatedAt: "desc" },
    take: limit,
    skip: offset,
  });

  return NextResponse.json({ payments });
}
