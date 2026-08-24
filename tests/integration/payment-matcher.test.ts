import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { matchPayment } from "@/lib/matcher/paymentMatcher";

async function seedMerchant() {
  const existing = await prisma.merchant.findFirst();
  if (existing) return existing;
  return prisma.merchant.create({
    data: { name: "Test Merchant", autoReversalWindowHours: 24, matchConfidenceThreshold: 0.7 },
  });
}

// Unique per call so repeated `npm test` runs (and multiple tests in one
// run) never collide on the same customer_ref, which would turn a
// "single match" case into an "ambiguous, multiple matches" case.
function randRef(label: string): string {
  return `cust_${label}_${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function seedPayment(overrides: Partial<{ razorpayPaymentId: string; customerRef: string | null }> = {}) {
  const merchant = await seedMerchant();
  return prisma.payment.create({
    data: {
      razorpayPaymentId: overrides.razorpayPaymentId ?? `pay_MATCH${Math.random().toString(36).slice(2, 12)}`,
      merchantId: merchant.id,
      status: "captured",
      captured: true,
      amount: 25000,
      currency: "INR",
      customerRef: overrides.customerRef ?? null,
      razorpayCreatedAt: new Date(),
      dataSource: "eval",
    },
  });
}

beforeEach(async () => {
  await seedMerchant();
});

describe("PaymentMatcher — explicit reference", () => {
  it("resolves an explicit payment_reference that exists in the store with confidence 1.0", async () => {
    const payment = await seedPayment();
    const result = await matchPayment({ extraction: { payment_reference: payment.razorpayPaymentId } });
    expect(result.matched).toBe(true);
    expect(result.razorpayPaymentId).toBe(payment.razorpayPaymentId);
    expect(result.matchConfidence).toBe(1.0);
    expect(result.matchMethod).toBe("explicit_reference");
  });

  it("never trusts an AI-proposed id that doesn't resolve to a real record", async () => {
    const result = await matchPayment({ extraction: { payment_reference: "pay_DOES_NOT_EXIST_123" } });
    expect(result.matched).toBe(false);
  });

  it("falls through to the customer-ref heuristic when the explicit reference doesn't resolve", async () => {
    const customerRef = randRef("fallback");
    const payment = await seedPayment({ customerRef });
    const result = await matchPayment({
      extraction: { payment_reference: "pay_BOGUS_REF" },
      customerRef,
    });
    expect(result.matched).toBe(true);
    expect(result.razorpayPaymentId).toBe(payment.razorpayPaymentId);
    expect(result.matchMethod).toBe("customer_ref_heuristic");
  });
});

describe("PaymentMatcher — customer_ref heuristic", () => {
  it("matches confidently when exactly one recent payment exists for the customer ref", async () => {
    const customerRef = randRef("single");
    const payment = await seedPayment({ customerRef });
    const result = await matchPayment({ extraction: { payment_reference: null }, customerRef });
    expect(result.matched).toBe(true);
    expect(result.razorpayPaymentId).toBe(payment.razorpayPaymentId);
    expect(result.matchConfidence).toBeLessThan(1.0);
  });

  it("refuses to guess when multiple recent payments exist for the same customer ref (ambiguous)", async () => {
    const customerRef = randRef("multi");
    await seedPayment({ customerRef });
    await seedPayment({ customerRef });
    const result = await matchPayment({ extraction: { payment_reference: null }, customerRef });
    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/multiple/i);
  });

  it("returns unmatched (ESCALATE-worthy) when there is neither a reference nor a customer ref", async () => {
    const result = await matchPayment({ extraction: { payment_reference: null } });
    expect(result.matched).toBe(false);
  });

  it("returns unmatched when the customer ref has no payments on record at all", async () => {
    const result = await matchPayment({ extraction: { payment_reference: null }, customerRef: randRef("unknown") });
    expect(result.matched).toBe(false);
  });
});
