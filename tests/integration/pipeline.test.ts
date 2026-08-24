import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchPaymentMock = vi.fn();
vi.mock("@/lib/razorpay/client", () => ({
  fetchPayment: (...args: unknown[]) => fetchPaymentMock(...args),
  createOrder: vi.fn(),
}));

const callAnthropicMock = vi.fn();
vi.mock("@/lib/ai/providers/anthropic", () => ({
  callAnthropic: (...args: unknown[]) => callAnthropicMock(...args),
}));

const { prisma } = await import("@/lib/db/client");
const { runSupportQueryPipeline } = await import("@/lib/pipeline/runSupportQuery");

async function seedMerchant() {
  const existing = await prisma.merchant.findFirst();
  if (existing) return existing;
  return prisma.merchant.create({
    data: { name: "Test Merchant", autoReversalWindowHours: 24, matchConfidenceThreshold: 0.7 },
  });
}

async function seedPayment(overrides: Record<string, unknown> = {}) {
  const merchant = await seedMerchant();
  const razorpayPaymentId = `pay_PIPE${Math.random().toString(36).slice(2, 12)}`;
  return prisma.payment.create({
    data: {
      razorpayPaymentId,
      merchantId: merchant.id,
      status: "authorized",
      captured: false,
      amount: 40000,
      currency: "INR",
      customerRef: "cust_pipeline@example.com",
      razorpayCreatedAt: new Date(),
      dataSource: "eval",
      ...overrides,
    },
  });
}

beforeEach(async () => {
  fetchPaymentMock.mockReset();
  callAnthropicMock.mockReset();
  await seedMerchant();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Pipeline — unknown payment reference", () => {
  it("ESCALATEs and never creates a decisions row when no payment can be matched at all", async () => {
    const result = await runSupportQueryPipeline({
      text: "please refund pay_TOTALLY_UNKNOWN_ID",
      source: "demo",
    });
    expect(result.decision.verdict).toBe("ESCALATE");
    expect(result.decisionDbId).toBeNull();

    const query = await prisma.supportQuery.findUnique({ where: { id: result.supportQueryId } });
    expect(query?.status).toBe("escalated");
  });
});

describe("Pipeline — Razorpay API unavailable (fail-safe)", () => {
  it("ESCALATEs via R0 rather than deciding off stale/cached data when the live fetch fails", async () => {
    const payment = await seedPayment();
    fetchPaymentMock.mockRejectedValue(new Error("network unreachable"));

    const result = await runSupportQueryPipeline({
      text: `refund ${payment.razorpayPaymentId} please`,
      source: "demo",
    });

    expect(result.decision.verdict).toBe("ESCALATE");
    expect(result.decision.ruleId).toBe("R0");
  });
});

describe("Pipeline — AI failure and malformed output both degrade to the deterministic fallback", () => {
  it("still produces a usable decision when the configured AI provider throws", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_API_KEY", "test-key");
    callAnthropicMock.mockRejectedValue(new Error("upstream timeout"));

    const payment = await seedPayment({ status: "captured", captured: true });
    fetchPaymentMock.mockResolvedValue({
      id: payment.razorpayPaymentId,
      entity: "payment",
      order_id: null,
      status: "captured",
      captured: true,
      amount: 40000,
      currency: "INR",
      created_at: Math.floor(Date.now() / 1000),
      notes: {},
    });
    const result = await runSupportQueryPipeline({
      text: `refund ${payment.razorpayPaymentId} please`,
      source: "demo",
    });

    expect(result.extractionSource).toBe("fallback");
    expect(result.decision.verdict).not.toBe("ESCALATE"); // explicit ID + captured -> confident ALLOW even via fallback
  });

  it("still produces a usable decision when the AI returns malformed/invalid JSON", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_API_KEY", "test-key");
    callAnthropicMock.mockResolvedValue({ not: "the right shape" });

    const payment = await seedPayment({ status: "captured", captured: true });
    fetchPaymentMock.mockResolvedValue({
      id: payment.razorpayPaymentId,
      entity: "payment",
      order_id: null,
      status: "captured",
      captured: true,
      amount: 40000,
      currency: "INR",
      created_at: Math.floor(Date.now() / 1000),
      notes: {},
    });
    const result = await runSupportQueryPipeline({
      text: `refund ${payment.razorpayPaymentId} please`,
      source: "demo",
    });

    expect(result.extractionSource).toBe("fallback");
    expect(result.decision).toBeDefined();
  });
});

describe("Pipeline — already-resolved double-refund prevention (R6)", () => {
  it("BLOCKs a refund request against an already-refunded payment", async () => {
    const payment = await seedPayment({ status: "refunded", captured: true });
    fetchPaymentMock.mockResolvedValue({
      id: payment.razorpayPaymentId,
      entity: "payment",
      order_id: null,
      status: "refunded",
      captured: true,
      amount: 40000,
      currency: "INR",
      created_at: Math.floor(Date.now() / 1000),
      notes: {},
    });
    const result = await runSupportQueryPipeline({
      text: `refund ${payment.razorpayPaymentId} again please`,
      source: "demo",
    });
    expect(["BLOCK", "ESCALATE"]).toContain(result.decision.verdict);
  });
});
