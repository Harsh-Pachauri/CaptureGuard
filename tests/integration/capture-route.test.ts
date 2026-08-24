import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPaymentMock = vi.fn();
vi.mock("@/lib/razorpay/client", () => ({
  fetchPayment: (...args: unknown[]) => fetchPaymentMock(...args),
  createOrder: vi.fn(),
}));

const capturePaymentMock = vi.fn();
const createRefundMock = vi.fn();
vi.mock("@/lib/razorpay/mutationClient", () => ({
  capturePayment: (...args: unknown[]) => capturePaymentMock(...args),
  createRefund: (...args: unknown[]) => createRefundMock(...args),
}));

const { prisma } = await import("@/lib/db/client");
const { POST } = await import("@/app/api/payments/[id]/capture/route");
const { NextRequest } = await import("next/server");

async function seedMerchant() {
  const existing = await prisma.merchant.findFirst();
  if (existing) return existing;
  return prisma.merchant.create({
    data: { name: "Test Merchant", autoReversalWindowHours: 24, matchConfidenceThreshold: 0.7 },
  });
}

function buildRequest(razorpayPaymentId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/payments/${razorpayPaymentId}/capture`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  fetchPaymentMock.mockReset();
  capturePaymentMock.mockReset();
  createRefundMock.mockReset();
  await seedMerchant();
});

describe("POST /api/payments/:id/capture — resolves through live state with no prior local row", () => {
  it("a payment that exists at Razorpay but has no local DB row is adopted and correctly ESCALATEs (R11) for a failed payment, with no mutation attempted", async () => {
    const razorpayPaymentId = `pay_ROUTENOLOCAL${Math.random().toString(36).slice(2, 12)}`;
    // Confirms the precondition this regression test targets: no local row.
    expect(await prisma.payment.findUnique({ where: { razorpayPaymentId } })).toBeNull();

    fetchPaymentMock.mockResolvedValue({
      id: razorpayPaymentId,
      entity: "payment",
      order_id: "order_ROUTE_TEST",
      status: "failed",
      captured: false,
      amount: 45000,
      currency: "INR",
      created_at: Math.floor(Date.now() / 1000),
      notes: {},
    });

    const res = await POST(buildRequest(razorpayPaymentId, { agentId: "agent_1" }), {
      params: Promise.resolve({ id: razorpayPaymentId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision.verdict).toBe("ESCALATE");
    expect(body.decision.ruleId).toBe("R11");

    // Resolved/adopted through live state — the same behavior GET
    // /api/payments/:id and the sync route already rely on.
    const adopted = await prisma.payment.findUnique({ where: { razorpayPaymentId } });
    expect(adopted).not.toBeNull();
    expect(adopted?.status).toBe("failed");

    expect(capturePaymentMock).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("still 404s for an id that is neither a local row nor a real Razorpay payment id shape", async () => {
    const id = "not-a-known-id-or-pay-prefixed";
    const res = await POST(buildRequest(id, { agentId: "agent_1" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
    expect(fetchPaymentMock).not.toHaveBeenCalled();
  });
});
