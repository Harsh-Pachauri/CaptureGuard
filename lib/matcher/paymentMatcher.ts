import { prisma } from "@/lib/db/client";
import type { IntentExtraction } from "@/lib/ai/schema";

export type MatchMethod =
  | "explicit_reference"
  | "customer_ref_heuristic"
  | "none";

export interface MatchResult {
  matched: boolean;
  paymentDbId?: string; // our internal Payment.id
  razorpayPaymentId?: string;
  matchConfidence: number;
  matchMethod: MatchMethod;
  reason?: string; // populated when matched: false
}

/**
 * PaymentMatcher (Section 3): turns (extraction, customerRef) into a
 * validated payment or a "no confident match" result. Deterministic-first —
 * an AI-proposed reference is only ever trusted once it resolves against a
 * real stored record; an AI-proposed ID that doesn't resolve is treated as a
 * failed match, never a guess.
 */
export async function matchPayment(input: {
  extraction: Pick<IntentExtraction, "payment_reference">;
  customerRef?: string | null;
}): Promise<MatchResult> {
  if (input.extraction.payment_reference) {
    const resolved = await resolveExplicitReference(input.extraction.payment_reference);
    if (resolved) {
      return {
        matched: true,
        paymentDbId: resolved.id,
        razorpayPaymentId: resolved.razorpayPaymentId,
        // An explicit reference that resolves to a real stored record is as
        // certain as a payment match gets, independent of the AI's own
        // confidence in the surrounding intent classification.
        matchConfidence: 1.0,
        matchMethod: "explicit_reference",
      };
    }
    // AI (or the fallback matcher) proposed an ID that doesn't exist in our
    // store — never trust that assertion. Fall through to the softer
    // customer-ref heuristic rather than giving up immediately.
  }

  if (input.customerRef) {
    const recent = await prisma.payment.findMany({
      where: { customerRef: input.customerRef },
      orderBy: { razorpayCreatedAt: "desc" },
      take: 5,
    });

    if (recent.length === 1) {
      return {
        matched: true,
        paymentDbId: recent[0].id,
        razorpayPaymentId: recent[0].razorpayPaymentId,
        // A single recent payment for this customer reference is a
        // reasonable heuristic match, but strictly less certain than an
        // explicit ID resolving directly — capped below 1.0.
        matchConfidence: 0.78,
        matchMethod: "customer_ref_heuristic",
      };
    }

    if (recent.length > 1) {
      return {
        matched: false,
        matchConfidence: 0,
        matchMethod: "none",
        reason:
          "Multiple recent payments found for this customer reference — cannot confidently pick one without an explicit payment or order ID.",
      };
    }

    return {
      matched: false,
      matchConfidence: 0,
      matchMethod: "none",
      reason: "No payments found for this customer reference.",
    };
  }

  return {
    matched: false,
    matchConfidence: 0,
    matchMethod: "none",
    reason: "No payment reference or customer reference was provided.",
  };
}

async function resolveExplicitReference(ref: string) {
  const trimmed = ref.trim();
  const byPaymentId = await prisma.payment.findUnique({
    where: { razorpayPaymentId: trimmed },
  });
  if (byPaymentId) return byPaymentId;

  const byOrderId = await prisma.payment.findFirst({
    where: { razorpayOrderId: trimmed },
  });
  return byOrderId ?? null;
}
