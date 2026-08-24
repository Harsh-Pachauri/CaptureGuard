import { beforeEach, describe, expect, it, vi } from "vitest";

const createRefundMock = vi.fn();
const capturePaymentMock = vi.fn();
vi.mock("@/lib/razorpay/mutationClient", () => ({
  createRefund: (...args: unknown[]) => createRefundMock(...args),
  capturePayment: (...args: unknown[]) => capturePaymentMock(...args),
}));

// Imported after the mock so actionGuard picks up the mocked mutation client.
const { prisma } = await import("@/lib/db/client");
const { attempt, confirmAndExecute, override } = await import(
  "@/lib/action-guard/actionGuard"
);
const auditService = await import("@/lib/audit/auditService");

async function seedMerchant() {
  const existing = await prisma.merchant.findFirst();
  if (existing) return existing;
  return prisma.merchant.create({
    data: { name: "Test Merchant", autoReversalWindowHours: 24, matchConfidenceThreshold: 0.7 },
  });
}

async function seedDecision(verdict: "ALLOW" | "BLOCK" | "ESCALATE") {
  const merchant = await seedMerchant();
  const razorpayPaymentId = `pay_TEST${Math.random().toString(36).slice(2, 14)}`;
  const payment = await prisma.payment.create({
    data: {
      razorpayPaymentId,
      merchantId: merchant.id,
      status: verdict === "BLOCK" ? "authorized" : "captured",
      captured: verdict !== "BLOCK",
      amount: 50000,
      currency: "INR",
      razorpayCreatedAt: new Date(),
      dataSource: "eval",
    },
  });
  const decision = await prisma.decision.create({
    data: {
      paymentId: payment.id,
      requestedAction: "refund",
      verdict,
      ruleId: verdict === "BLOCK" ? "R4" : verdict === "ALLOW" ? "R3" : "R5",
      explanation: `test ${verdict} explanation`,
      paymentSnapshot: { razorpayPaymentId, amount: 50000 },
    },
  });
  return { payment, decision };
}

async function seedCaptureDecision(verdict: "ALLOW" | "BLOCK" | "ESCALATE") {
  const merchant = await seedMerchant();
  const razorpayPaymentId = `pay_TEST${Math.random().toString(36).slice(2, 14)}`;
  // ALLOW: authorized+uncaptured, inside window (R9). BLOCK: already captured (R10).
  // ESCALATE: failed, doesn't match a known-safe capture pattern (R11).
  const status = verdict === "BLOCK" ? "captured" : verdict === "ALLOW" ? "authorized" : "failed";
  const payment = await prisma.payment.create({
    data: {
      razorpayPaymentId,
      merchantId: merchant.id,
      status,
      captured: verdict === "BLOCK",
      amount: 50000,
      currency: "INR",
      razorpayCreatedAt: new Date(),
      dataSource: "eval",
    },
  });
  const decision = await prisma.decision.create({
    data: {
      paymentId: payment.id,
      requestedAction: "capture",
      verdict,
      ruleId: verdict === "BLOCK" ? "R10" : verdict === "ALLOW" ? "R9" : "R11",
      explanation: `test capture ${verdict} explanation`,
      paymentSnapshot: { razorpayPaymentId, amount: 50000, currency: "INR" },
    },
  });
  return { payment, decision };
}

beforeEach(() => {
  createRefundMock.mockReset();
  capturePaymentMock.mockReset();
});

describe("ActionGuard — a BLOCK verdict is never bypassed", () => {
  it("attempt() on BLOCK returns 409 and never touches the mutation client", async () => {
    const { decision } = await seedDecision("BLOCK");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    expect(result.status).toBe(409);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("confirm called directly on a blocked action is rejected server-side even simulating a direct API bypass", async () => {
    const { decision } = await seedDecision("BLOCK");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocked: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confirmed: any = await confirmAndExecute(blocked.action.id, "agent_1");
    expect(confirmed.status).toBe(409);
    expect(createRefundMock).not.toHaveBeenCalled();
  });
});

describe("ActionGuard — ALLOW requires an explicit confirm before any mutation call", () => {
  it("attempt() on ALLOW never calls the mutation client and reports requiresConfirmation", async () => {
    const { decision } = await seedDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    expect(result.requiresConfirmation).toBe(true);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("confirmAndExecute() calls the mutation client exactly once and marks the action executed", async () => {
    createRefundMock.mockResolvedValue({
      id: "rfnd_TEST123",
      entity: "refund",
      payment_id: "pay_x",
      amount: 50000,
      status: "processed",
      created_at: 0,
    });
    const { decision } = await seedDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confirmResult: any = await confirmAndExecute(attemptResult.action.id, "agent_1");
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(confirmResult.action.state).toBe("executed");
    expect(confirmResult.action.razorpayRefundId).toBe("rfnd_TEST123");
  });

  it("marks the action failed, not silently retried, when the Razorpay mutation call fails", async () => {
    createRefundMock.mockRejectedValue(new Error("Razorpay refund failed (500)"));
    const { decision } = await seedDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confirmResult: any = await confirmAndExecute(attemptResult.action.id, "agent_1");
    expect(confirmResult.action.state).toBe("failed");
    expect(createRefundMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a second confirm on an already-executed action rather than double-calling Razorpay", async () => {
    createRefundMock.mockResolvedValue({
      id: "rfnd_ONCE",
      entity: "refund",
      payment_id: "pay_x",
      amount: 50000,
      status: "processed",
      created_at: 0,
    });
    const { decision } = await seedDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    await confirmAndExecute(attemptResult.action.id, "agent_1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second: any = await confirmAndExecute(attemptResult.action.id, "agent_1");
    expect(second.status).toBe(409);
    expect(createRefundMock).toHaveBeenCalledTimes(1);
  });
});

describe("ActionGuard — override", () => {
  it("rejects an override with an empty/too-short reason and never calls the mutation client", async () => {
    const { decision } = await seedDecision("BLOCK");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await override(attemptResult.action.id, "agent_1", "no");
    expect(result.status).toBe(400);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("records the override with its reason and then executes the real mutation call", async () => {
    createRefundMock.mockResolvedValue({
      id: "rfnd_OVERRIDE1",
      entity: "refund",
      payment_id: "pay_x",
      amount: 50000,
      status: "processed",
      created_at: 0,
    });
    const { decision } = await seedDecision("BLOCK");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await override(
      attemptResult.action.id,
      "agent_1",
      "Customer escalated to legal, manager approved override."
    );
    expect(result.action.state).toBe("executed");
    expect(result.action.overrideReason).toContain("manager approved");
    expect(createRefundMock).toHaveBeenCalledTimes(1);

    const events = await auditService.query({ refTable: "actions", refId: attemptResult.action.id });
    const types = events.map((e) => e.eventType);
    expect(types).toContain("override_recorded");
    expect(types).toContain("action_executed");
  });

  it("rejects override on a non-BLOCK decision", async () => {
    const { decision } = await seedDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "refund", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await override(attemptResult.action.id, "agent_1", "trying to override an ALLOW");
    expect(result.status).toBe(400);
    expect(createRefundMock).not.toHaveBeenCalled();
  });
});

describe("ActionGuard — capture-mirror uses the same gateway, never the refund mutation", () => {
  it("BLOCK (already captured) never touches either mutation function", async () => {
    const { decision } = await seedCaptureDecision("BLOCK");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await attempt({ decisionId: decision.id, actionType: "capture", agentId: "agent_1" });
    expect(result.status).toBe(409);
    expect(capturePaymentMock).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("ESCALATE (unsafe pattern) is never confirmable — attempt() does not grant requiresConfirmation", async () => {
    const { decision } = await seedCaptureDecision("ESCALATE");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await attempt({ decisionId: decision.id, actionType: "capture", agentId: "agent_1" });
    expect(result.requiresConfirmation).toBeFalsy();
    expect(capturePaymentMock).not.toHaveBeenCalled();
  });

  it("ALLOW requires an explicit confirm before capturePayment is ever called", async () => {
    const { decision } = await seedCaptureDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await attempt({ decisionId: decision.id, actionType: "capture", agentId: "agent_1" });
    expect(result.requiresConfirmation).toBe(true);
    expect(capturePaymentMock).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("confirmAndExecute() on ALLOW calls capturePayment exactly once with amount/currency from the snapshot, never createRefund", async () => {
    capturePaymentMock.mockResolvedValue({
      id: "pay_x",
      entity: "payment",
      order_id: null,
      status: "captured",
      captured: true,
      amount: 50000,
      currency: "INR",
      created_at: 0,
      notes: {},
    });
    const { decision, payment } = await seedCaptureDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "capture", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confirmResult: any = await confirmAndExecute(attemptResult.action.id, "agent_1");
    expect(capturePaymentMock).toHaveBeenCalledTimes(1);
    expect(capturePaymentMock).toHaveBeenCalledWith(payment.razorpayPaymentId, {
      amount: 50000,
      currency: "INR",
    });
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(confirmResult.action.state).toBe("executed");
  });

  it("marks the action failed, not silently retried, when the Razorpay capture call fails", async () => {
    capturePaymentMock.mockRejectedValue(new Error("Razorpay capture failed (400)"));
    const { decision } = await seedCaptureDecision("ALLOW");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "capture", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confirmResult: any = await confirmAndExecute(attemptResult.action.id, "agent_1");
    expect(confirmResult.action.state).toBe("failed");
    expect(capturePaymentMock).toHaveBeenCalledTimes(1);
  });

  it("override is available for a BLOCKed capture too (the same generic mechanism, not a capture-specific bypass)", async () => {
    capturePaymentMock.mockResolvedValue({
      id: "pay_x",
      entity: "payment",
      order_id: null,
      status: "captured",
      captured: true,
      amount: 50000,
      currency: "INR",
      created_at: 0,
      notes: {},
    });
    const { decision } = await seedCaptureDecision("BLOCK");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attemptResult: any = await attempt({ decisionId: decision.id, actionType: "capture", agentId: "agent_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await override(
      attemptResult.action.id,
      "agent_1",
      "Confirmed with Razorpay support this specific case is safe to force."
    );
    expect(result.action.state).toBe("executed");
    expect(capturePaymentMock).toHaveBeenCalledTimes(1);
  });
});
