export type JudgeScenarioId = "block" | "allow" | "escalate";

export interface JudgeScenarioConfig {
  id: JudgeScenarioId;
  ruleId: string;
  verdict: "BLOCK" | "ALLOW" | "ESCALATE";
  label: string;
  title: string;
  description: string;
  /** What the judge should do at Razorpay's Test Mode checkout screen. */
  checkoutOutcome: "success" | "failure";
  checkoutGuidance: string;
  action: "refund" | "capture";
}

/**
 * The three scenarios the Test Lab runner (app/(dashboard)/test-lab/**)
 * drives. Descriptions are honest paraphrases of the real rules in
 * lib/decision-engine/rules.ts (R4, R9, R11) — same convention already
 * used for the landing page's exhibit (lib/decision-cases.ts) — never
 * verbatim-dynamic text, but never inventing a condition the rule doesn't
 * actually have either. Nothing here computes a verdict; the real
 * pipeline (POST /api/support-queries or POST /api/payments/:id/capture)
 * does that.
 */
export const JUDGE_SCENARIOS: JudgeScenarioConfig[] = [
  {
    id: "block",
    ruleId: "R4",
    verdict: "BLOCK",
    label: "BLOCK · R4",
    title: "Refund an auto-reversing payment",
    description:
      "An authorized, uncaptured payment is still inside Razorpay's own auto-reversal window. You'll ask CaptureGuard to refund it — it blocks the request, because refunding now could double-pay the customer once Razorpay's own reversal completes.",
    checkoutOutcome: "success",
    checkoutGuidance:
      "Pay with a Razorpay Test Mode card — 4111 1111 1111 1111, any future expiry, any CVV — and complete the payment normally.",
    action: "refund",
  },
  {
    id: "allow",
    ruleId: "R9",
    verdict: "ALLOW",
    label: "ALLOW · R9",
    title: "Capture an eligible payment",
    description:
      "Same authorized, uncaptured state — but this time the request is to capture it, which is exactly what manual capture exists for. CaptureGuard allows it, and you can go on to confirm a real Razorpay Capture API call.",
    checkoutOutcome: "success",
    checkoutGuidance:
      "Pay with a Razorpay Test Mode card — 4111 1111 1111 1111, any future expiry, any CVV — and complete the payment normally.",
    action: "capture",
  },
  {
    id: "escalate",
    ruleId: "R11",
    verdict: "ESCALATE",
    label: "ESCALATE · R11",
    title: "Act on a failed payment",
    description:
      "A capture is requested on a payment that never actually succeeded at Razorpay. It doesn't match the known-safe capture pattern, so CaptureGuard refuses to guess and escalates for a human to check directly — rather than assuming either outcome.",
    checkoutOutcome: "failure",
    checkoutGuidance:
      "When Razorpay's Test Mode screen offers to simulate the outcome, choose Failure instead of completing the payment — that's what creates the failed payment R11 is designed to catch.",
    action: "capture",
  },
];

export function getJudgeScenario(id: string): JudgeScenarioConfig | undefined {
  return JUDGE_SCENARIOS.find((s) => s.id === id);
}
