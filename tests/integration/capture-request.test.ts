import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPaymentMock = vi.fn();
vi.mock("@/lib/razorpay/client", () => ({
  fetchPayment: (...args: unknown[]) => fetchPaymentMock(...args),
  createOrder: vi.fn(),
}));

const { prisma } = await import("@/lib/db/client");
const { runCaptureRequest } = await import("@/lib/pipeline/runCaptureRequest");

async function seedMerchant() {
  const existing = await prisma.merchant.findFirst();
  if (existing) return existing;
  return prisma.merchant.create({
    data: { name: "Test Merchant", autoReversalWindowHours: 24, matchConfidenceThreshold: 0.7 },
  });
}

async function seedPayment(overrides: Record<string, unknown> = {}) {
  const merchant = await seedMerchant();
  const razorpayPaymentId = `pay_CAPREQ${Math.random().toString(36).slice(2, 12)}`;
  return prisma.payment.create({
    data: {
      razorpayPaymentId,
      merchantId: merchant.id,
      status: "authorized",
      captured: false,
      amount: 40000,
      currency: "INR",
      razorpayCreatedAt: new Date(),
      dataSource: "eval",
      ...overrides,
    },
  });
}

function razorpayPaymentFixture(overrides: Record<string, unknown> = {}) {
  return {
    entity: "payment",
    order_id: null,
    status: "authorized",
    captured: false,
    amount: 40000,
    currency: "INR",
    created_at: Math.floor(Date.now() / 1000),
    notes: {},
    ...overrides,
  };
}

beforeEach(async () => {
  fetchPaymentMock.mockReset();
  await seedMerchant();
});

describe("runCaptureRequest — deterministic wiring, no AI, no fuzzy matching", () => {
  it("ALLOWs (R9) and persists a Decision when authorized+uncaptured, inside the window, live-fetch succeeds", async () => {
    const payment = await seedPayment();
    fetchPaymentMock.mockResolvedValue(razorpayPaymentFixture({ id: payment.razorpayPaymentId }));

    const result = await runCaptureRequest({ razorpayPaymentId: payment.razorpayPaymentId, agentId: "agent_1" });

    expect(result.decision.verdict).toBe("ALLOW");
    expect(result.decision.ruleId).toBe("R9");
    expect(result.decisionDbId).not.toBeNull();

    const row = await prisma.decision.findUnique({ where: { id: result.decisionDbId! } });
    expect(row?.requestedAction).toBe("capture");
    expect(row?.verdict).toBe("ALLOW");
  });

  it("BLOCKs (R10) when the payment is already captured", async () => {
    const payment = await seedPayment({ status: "captured", captured: true });
    fetchPaymentMock.mockResolvedValue(
      razorpayPaymentFixture({ id: payment.razorpayPaymentId, status: "captured", captured: true })
    );

    const result = await runCaptureRequest({ razorpayPaymentId: payment.razorpayPaymentId, agentId: "agent_1" });

    expect(result.decision.verdict).toBe("BLOCK");
    expect(result.decision.ruleId).toBe("R10");
  });

  it("ESCALATEs via R0 rather than guessing when the live Razorpay fetch fails", async () => {
    const payment = await seedPayment();
    fetchPaymentMock.mockRejectedValue(new Error("network unreachable"));

    const result = await runCaptureRequest({ razorpayPaymentId: payment.razorpayPaymentId, agentId: "agent_1" });

    expect(result.decision.verdict).toBe("ESCALATE");
    expect(result.decision.ruleId).toBe("R0");
  });

  it("ESCALATEs without persisting a Decision when there is no local record and the live fetch also fails", async () => {
    fetchPaymentMock.mockRejectedValue(new Error("not found"));

    const result = await runCaptureRequest({ razorpayPaymentId: "pay_TOTALLY_UNKNOWN", agentId: "agent_1" });

    expect(result.decision.verdict).toBe("ESCALATE");
    expect(result.decisionDbId).toBeNull();
  });

  it("does not depend on AI extraction or fuzzy matching — an exact id with matchConfidence 1.0 always passes R1", async () => {
    const payment = await seedPayment();
    // getLive() always overwrites the stored row with the live-fetched
    // truth, so what matters for the window calculation is the MOCK
    // fixture's created_at (25h ago, past the 24h default window), not
    // whatever razorpayCreatedAt the row was seeded with.
    fetchPaymentMock.mockResolvedValue(
      razorpayPaymentFixture({
        id: payment.razorpayPaymentId,
        created_at: Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000),
      })
    );

    const result = await runCaptureRequest({ razorpayPaymentId: payment.razorpayPaymentId, agentId: "agent_1" });

    // R1 (confidence gating) never fires for this path; falls through to R11 (past-window catch-all), not R1.
    expect(result.decision.ruleId).not.toBe("R1");
    expect(result.decision.ruleId).toBe("R11");
    expect(result.decision.verdict).toBe("ESCALATE");
  });
});
