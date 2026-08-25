import type { Verdict } from "@/lib/verdict";

export type DecisionCase = {
  id: string;
  ruleId: string;
  verdict: Verdict;
  label: string;
  request: string;
  aiIntent: string;
  razorpayField: string;
  explanation: string;
};

/**
 * Three real, already-adjudicated decisions from the system's own audit
 * trail. This is a replay, not live inference — it's labeled as such in
 * the UI, and it should stay that way. TODO: swap the request/intent copy
 * below for the exact payment IDs and AI-extracted intent strings from the
 * real audit log — the shape and the verdict/rule pairing are correct,
 * the exact strings are placeholders.
 *
 * Lives here rather than in components/VerdictTraceDemo.tsx because that
 * file is "use client": a plain data export from a client module can't be
 * evaluated by the server-component landing page during static generation
 * (Next.js's client-boundary bundling only special-cases the component
 * export itself) — app/page.tsx needs this array directly.
 */
export const DECISION_CASES: DecisionCase[] = [
  {
    id: "r4",
    ruleId: "R4",
    verdict: "BLOCK",
    label: "Refund request",
    request: "POST /payments/pay_N7xQm2/refund",
    aiIntent: "Customer asking for a refund on a completed charge.",
    razorpayField: "status: authorized · auto-reversal in progress",
    explanation:
      "Razorpay is already reversing this payment automatically. Refunding it now could double-pay the customer.",
  },
  {
    id: "r9",
    ruleId: "R9",
    verdict: "ALLOW",
    label: "Capture request",
    request: "POST /payments/pay_K3vRt8/capture",
    aiIntent: "Merchant asking to capture an authorized payment.",
    razorpayField: "status: authorized · captured: false",
    explanation:
      "Razorpay confirms this payment is authorized and still uncaptured — capturing it is exactly what's being asked, with nothing in live state that conflicts.",
  },
  {
    id: "r11",
    ruleId: "R11",
    verdict: "ESCALATE",
    label: "Capture request",
    request: "POST /payments/pay_D9fLp1/capture",
    aiIntent: "Merchant asking to capture a payment believed to be authorized.",
    razorpayField: "status: failed · captured: false",
    explanation:
      "Razorpay shows this payment's capture already failed. The request assumes it succeeded — that mismatch is enough to stop and route to a human, not to guess.",
  },
];
