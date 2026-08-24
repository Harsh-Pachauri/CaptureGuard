// READ-ONLY Razorpay client: order creation (demo/dev data generation only)
// and payment fetch (the live source-of-truth check). This module must never
// gain a mutation method — refunds/captures live exclusively in
// mutationClient.ts, imported only by lib/action-guard. See Section 13 of the
// blueprint and docs/ARCHITECTURE.md for why this split is a hard boundary.

import { razorpayAuthHeader, requestWithRetry, safeJson } from "./http";

const BASE_URL = "https://api.razorpay.com/v1";

export interface RazorpayOrder {
  id: string;
  entity: "order";
  amount: number;
  currency: string;
  status: string;
  notes: Record<string, unknown>;
  created_at: number;
}

export interface RazorpayPayment {
  id: string;
  entity: "payment";
  order_id: string | null;
  status: string; // created|authorized|captured|refunded|failed
  captured: boolean;
  amount: number;
  currency: string;
  created_at: number;
  notes: Record<string, unknown>;
  amount_refunded?: number;
  refund_status?: string | null;
  [key: string]: unknown;
}

export interface CreateOrderInput {
  amount: number; // paise
  currency?: string;
  capture_immediately?: boolean; // maps to payment_capture: 1 | 0
  notes?: Record<string, unknown>;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<RazorpayOrder> {
  const res = await requestWithRetry(`${BASE_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: razorpayAuthHeader(),
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency ?? "INR",
      payment_capture: input.capture_immediately ? 1 : 0,
      notes: input.notes ?? {},
    }),
  });

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Razorpay order creation failed (${res.status}): ${JSON.stringify(body)}`
    );
  }

  return res.json() as Promise<RazorpayOrder>;
}

export async function fetchPayment(
  paymentId: string
): Promise<RazorpayPayment> {
  const res = await requestWithRetry(`${BASE_URL}/payments/${paymentId}`, {
    method: "GET",
    headers: { Authorization: razorpayAuthHeader() },
  });

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Razorpay payment fetch failed (${res.status}): ${JSON.stringify(body)}`
    );
  }

  return res.json() as Promise<RazorpayPayment>;
}
