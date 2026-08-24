import { NextResponse, type NextRequest } from "next/server";
import { checkBearerAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/client";
import { getMerchant } from "@/lib/db/merchant";

/**
 * Not part of Section 5's original endpoint list — added to satisfy an
 * explicit, additional requirement laid out alongside the blueprint: the
 * auto-reversal safety window must be configurable and clearly visible in
 * the app/admin configuration, and swappable to a short demo value without
 * a redeploy. This reads/writes exactly `merchants.auto_reversal_window_hours`
 * and `merchants.match_confidence_threshold` — the same policy columns
 * Section 4 already defines — nothing new is introduced to the schema.
 */
export async function GET(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  const merchant = await getMerchant();
  return NextResponse.json({ merchant });
}

export async function PATCH(req: NextRequest) {
  const authError = checkBearerAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as {
    autoReversalWindowHours?: unknown;
    matchConfidenceThreshold?: unknown;
  };

  const data: { autoReversalWindowHours?: number; matchConfidenceThreshold?: number } = {};

  if (input.autoReversalWindowHours !== undefined) {
    const hours = Number(input.autoReversalWindowHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json({ error: "autoReversalWindowHours must be a positive number" }, { status: 400 });
    }
    data.autoReversalWindowHours = hours;
  }

  if (input.matchConfidenceThreshold !== undefined) {
    const threshold = Number(input.matchConfidenceThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return NextResponse.json({ error: "matchConfidenceThreshold must be between 0 and 1" }, { status: 400 });
    }
    data.matchConfidenceThreshold = threshold;
  }

  const merchant = await getMerchant();
  const updated = await prisma.merchant.update({ where: { id: merchant.id }, data });

  return NextResponse.json({ merchant: updated });
}
