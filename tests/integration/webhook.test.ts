import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const fetchPaymentMock = vi.fn();
vi.mock("@/lib/razorpay/client", () => ({
  fetchPayment: (...args: unknown[]) => fetchPaymentMock(...args),
  createOrder: vi.fn(),
}));

const { prisma } = await import("@/lib/db/client");
const { POST } = await import("@/app/api/webhooks/razorpay/route");
const { NextRequest } = await import("next/server");

const WEBHOOK_SECRET = "test_webhook_secret";

function signBody(body: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function buildRequest(rawBody: string, signature: string | null) {
  return new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    body: rawBody,
    headers: signature ? { "x-razorpay-signature": signature } : {},
  });
}

async function seedMerchant() {
  const existing = await prisma.merchant.findFirst();
  if (existing) return existing;
  return prisma.merchant.create({
    data: { name: "Test Merchant", autoReversalWindowHours: 24, matchConfidenceThreshold: 0.7 },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function samplePayload(overrides: any = {}) {
  const paymentId = `pay_WEBHOOKTEST${Math.random().toString(36).slice(2, 10)}`;
  return {
    entity: "event",
    account_id: "acc_TEST",
    event: "payment.authorized",
    contains: ["payment"],
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          order_id: null,
          status: "authorized",
          captured: false,
          amount: 50000,
          currency: "INR",
          created_at: Math.floor(Date.now() / 1000),
          notes: {},
        },
      },
    },
    ...overrides,
  };
}

beforeEach(async () => {
  fetchPaymentMock.mockReset();
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await seedMerchant();
});

describe("Webhook receiver — signature verification", () => {
  it("accepts a validly signed payload and applies the resulting state", async () => {
    const payload = samplePayload();
    fetchPaymentMock.mockResolvedValue(payload.payload.payment.entity);
    const raw = JSON.stringify(payload);

    const res = await POST(buildRequest(raw, signBody(raw)));
    expect(res.status).toBe(200);

    const paymentRow = await prisma.payment.findUnique({
      where: { razorpayPaymentId: payload.payload.payment.entity.id },
    });
    expect(paymentRow).not.toBeNull();
    expect(paymentRow?.status).toBe("authorized");
  });

  it("rejects an invalid signature with no state change", async () => {
    const payload = samplePayload();
    const raw = JSON.stringify(payload);

    const res = await POST(buildRequest(raw, "totally-wrong-signature"));
    expect(res.status).toBe(400);

    const paymentRow = await prisma.payment.findUnique({
      where: { razorpayPaymentId: payload.payload.payment.entity.id },
    });
    expect(paymentRow).toBeNull();
    expect(fetchPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header at all", async () => {
    const payload = samplePayload();
    const raw = JSON.stringify(payload);
    const res = await POST(buildRequest(raw, null));
    expect(res.status).toBe(400);
  });
});

describe("Webhook receiver — dedupe", () => {
  it("treats a duplicate event id as a confirmed no-op, not reprocessed", async () => {
    const payload = samplePayload();
    fetchPaymentMock.mockResolvedValue(payload.payload.payment.entity);
    const raw = JSON.stringify(payload);
    const signature = signBody(raw);

    const res1 = await POST(buildRequest(raw, signature));
    expect(res1.status).toBe(200);
    expect(fetchPaymentMock).toHaveBeenCalledTimes(1);

    const res2 = await POST(buildRequest(raw, signature));
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.status).toBe("duplicate");
    expect(fetchPaymentMock).toHaveBeenCalledTimes(1); // not reprocessed
  });

  it("does not treat authorized and captured for the same payment as duplicates", async () => {
    const authorized = samplePayload();
    const captured = samplePayload({
      event: "payment.captured",
      payload: {
        payment: { entity: { ...authorized.payload.payment.entity, status: "captured", captured: true } },
      },
    });
    fetchPaymentMock.mockResolvedValue(authorized.payload.payment.entity);

    const rawAuthorized = JSON.stringify(authorized);
    const res1 = await POST(buildRequest(rawAuthorized, signBody(rawAuthorized)));
    expect(res1.status).toBe(200);
    expect((await res1.json()).status).not.toBe("duplicate");

    const rawCaptured = JSON.stringify(captured);
    const res2 = await POST(buildRequest(rawCaptured, signBody(rawCaptured)));
    expect(res2.status).toBe(200);
    expect((await res2.json()).status).not.toBe("duplicate");
  });
});

describe("Webhook receiver — malformed payloads", () => {
  it("rejects malformed JSON without crashing the process", async () => {
    const raw = "{not valid json";
    await expect(POST(buildRequest(raw, signBody(raw)))).resolves.not.toThrow();
    const res = await POST(buildRequest(raw, signBody(raw)));
    expect(res.status).toBe(400);
  });

  it("rejects a well-formed JSON payload missing event/created_at fields", async () => {
    const raw = JSON.stringify({ payload: {} });
    const res = await POST(buildRequest(raw, signBody(raw)));
    expect(res.status).toBe(400);
  });

  it("still records unrecognized-but-valid event types rather than erroring", async () => {
    const payload = samplePayload({ event: "order.paid" });
    const raw = JSON.stringify(payload);
    const res = await POST(buildRequest(raw, signBody(raw)));
    expect(res.status).toBe(200);
    expect(fetchPaymentMock).not.toHaveBeenCalled();
  });
});
