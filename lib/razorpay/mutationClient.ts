// THE ONLY MODULE IN THIS CODEBASE ALLOWED TO CALL A RAZORPAY MUTATION
// ENDPOINT. Import this file only from lib/action-guard/*. Nowhere else —
// not AI code, not API routes directly, not the matcher, not the decision
// engine. This is what makes "AI (or a stray route) accidentally moves
// money" structurally impossible rather than merely discouraged.
//
// If you're tempted to import this from a new file, stop: the thing you
// need almost certainly belongs behind lib/action-guard's confirm step
// instead.

import { razorpayAuthHeader, requestWithRetry, safeJson } from "./http";
import type { RazorpayPayment } from "./client";

const BASE_URL = "https://api.razorpay.com/v1";

export interface RazorpayRefund {
  id: string;
  entity: "refund";
  payment_id: string;
  amount: number;
  status: string;
  created_at: number;
}

export async function createRefund(
  paymentId: string,
  input?: { amount?: number; notes?: Record<string, unknown> }
): Promise<RazorpayRefund> {
  const res = await requestWithRetry(
    `${BASE_URL}/payments/${paymentId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: razorpayAuthHeader(),
      },
      body: JSON.stringify({
        ...(input?.amount ? { amount: input.amount } : {}),
        notes: input?.notes ?? {},
      }),
    }
  );

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Razorpay refund failed (${res.status}): ${JSON.stringify(body)}`
    );
  }

  return res.json() as Promise<RazorpayRefund>;
}

/**
 * Capture-mirror: the manual-capture counterpart to createRefund above,
 * same real-endpoint/same-file/same-import-boundary treatment. Razorpay
 * requires amount+currency on the capture call to match the authorized
 * payment exactly — the caller (Action Guard) supplies them from the same
 * live-fetched snapshot the Decision Engine verdict was computed from,
 * never from client input.
 */
export async function capturePayment(
  paymentId: string,
  input: { amount: number; currency: string }
): Promise<RazorpayPayment> {
  const res = await requestWithRetry(
    `${BASE_URL}/payments/${paymentId}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: razorpayAuthHeader(),
      },
      body: JSON.stringify({ amount: input.amount, currency: input.currency }),
    }
  );

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Razorpay capture failed (${res.status}): ${JSON.stringify(body)}`
    );
  }

  return res.json() as Promise<RazorpayPayment>;
}
