import type { Decision, DecisionInput } from "./types";

const MONEY_ACTIONS = new Set(["refund", "compensate"]);

function isMoneyAction(action: DecisionInput["requestedAction"]): boolean {
  return MONEY_ACTIONS.has(action);
}

function elapsedHours(razorpayCreatedAt: string, now: string): number {
  const elapsedMs = new Date(now).getTime() - new Date(razorpayCreatedAt).getTime();
  return elapsedMs / (1000 * 60 * 60);
}

function windowEndsAt(razorpayCreatedAt: string, windowHours: number): string {
  const end = new Date(razorpayCreatedAt).getTime() + windowHours * 60 * 60 * 1000;
  return new Date(end).toISOString();
}

function formatAmount(amountPaise: number, currency: string): string {
  return `${currency} ${(amountPaise / 100).toFixed(2)}`;
}

/**
 * Fields every rendering (UI, audit row, Action Guard explanation) can cite
 * directly — never a free-form AI sentence for the safety-critical line.
 * Every value here traces back to the live-fetched payment snapshot.
 */
function groundedFields(input: DecisionInput): Record<string, unknown> {
  return {
    razorpayPaymentId: input.razorpayPaymentId,
    status: input.status,
    captured: input.captured,
    amount: input.amount,
    amountFormatted: formatAmount(input.amount, input.currency),
    currency: input.currency,
    razorpayCreatedAt: input.razorpayCreatedAt,
    checkedAt: input.now,
    autoReversalWindowHours: input.autoReversalWindowHours,
    windowEndsAt: windowEndsAt(input.razorpayCreatedAt, input.autoReversalWindowHours),
    elapsedHours: Number(elapsedHours(input.razorpayCreatedAt, input.now).toFixed(2)),
    requestedAction: input.requestedAction,
    matchConfidence: input.matchConfidence,
    matchThreshold: input.matchThreshold,
    existingRefundOnRecord: input.existingRefundOnRecord,
  };
}

type Rule = {
  id: string;
  reasoning: string;
  check: (input: DecisionInput) => Decision | null;
};

/**
 * The rule table from Section 8 of the blueprint, implemented literally:
 * R0 through R8, evaluated strictly in this order, first match wins. R8 is
 * an unconditional catch-all so this array always produces a verdict — the
 * engine never throws and never falls through to "no decision."
 */
export const RULES: Rule[] = [
  {
    id: "R0",
    reasoning:
      "Fail safe — never gate a money decision on stale or missing data.",
    check: (input) => {
      if (input.sourceAvailable) return null;
      return {
        verdict: "ESCALATE",
        ruleId: "R0",
        explanation:
          `Could not verify payment ${input.razorpayPaymentId}'s live status with Razorpay just now ` +
          `(the API call failed or timed out). Never guessing on a money decision — flagging for a human ` +
          `to check the Razorpay Dashboard directly rather than acting on stale or missing data.`,
        groundedFields: groundedFields(input),
      };
    },
  },
  {
    id: "R1",
    reasoning:
      "Never act on an uncertain reference; ask for clarification instead.",
    check: (input) => {
      const confident =
        input.matchConfidence !== null &&
        input.matchConfidence >= input.matchThreshold;
      if (confident) return null;
      const confidenceNote =
        input.matchConfidence === null
          ? "No confident payment match was found for this request."
          : `Match confidence (${input.matchConfidence.toFixed(2)}) is below the required threshold (${input.matchThreshold.toFixed(2)}).`;
      return {
        verdict: "ESCALATE",
        ruleId: "R1",
        explanation:
          `${confidenceNote} Rather than guess which payment this refers to, this is flagged for a ` +
          `human to confirm — please provide an explicit payment or order ID.`,
        groundedFields: groundedFields(input),
      };
    },
  },
  {
    id: "R2",
    reasoning: "Never block information.",
    check: (input) => {
      if (input.requestedAction !== "status_check") return null;
      return {
        verdict: "ALLOW",
        ruleId: "R2",
        explanation:
          `This is a status/information request only — no money movement involved, so it is never ` +
          `blocked. Payment ${input.razorpayPaymentId} is currently "${input.status}"` +
          `${input.captured ? "" : ` (captured: ${input.captured})`}.`,
        groundedFields: groundedFields(input),
      };
    },
  },
  {
    id: "R3",
    reasoning:
      "Ordinary, unambiguous refund case — the real Razorpay Refunds API is called here.",
    check: (input) => {
      if (
        input.status === "captured" &&
        !input.existingRefundOnRecord &&
        isMoneyAction(input.requestedAction)
      ) {
        return {
          verdict: "ALLOW",
          ruleId: "R3",
          explanation:
            `Payment ${input.razorpayPaymentId} is captured with no existing refund on record. This is a ` +
            `standard, unambiguous refund case — proceeding will call Razorpay's real Refunds API once you confirm.`,
          groundedFields: groundedFields(input),
        };
      }
      return null;
    },
  },
  {
    id: "R4",
    reasoning:
      "The central case: Razorpay is already handling this; acting now risks a double payout.",
    check: (input) => {
      if (
        input.status === "authorized" &&
        !input.captured &&
        isMoneyAction(input.requestedAction) &&
        elapsedHours(input.razorpayCreatedAt, input.now) < input.autoReversalWindowHours
      ) {
        return {
          verdict: "BLOCK",
          ruleId: "R4",
          explanation:
            `Payment ${input.razorpayPaymentId} is authorized but not captured (as of the last check, ${input.now}). ` +
            `It is still within the ${input.autoReversalWindowHours}-hour window Razorpay allows for automatic ` +
            `reversal, which began at ${input.razorpayCreatedAt}. Manually refunding or compensating now may result ` +
            `in the customer being paid twice. This is blocked until ${windowEndsAt(input.razorpayCreatedAt, input.autoReversalWindowHours)} ` +
            `or until Razorpay's own reversal is confirmed.`,
          groundedFields: groundedFields(input),
        };
      }
      return null;
    },
  },
  {
    id: "R5",
    reasoning:
      "Razorpay's own stated SLA has passed with nothing seen — a genuine exception needing a human to check directly, not a system guess.",
    check: (input) => {
      if (
        input.status === "authorized" &&
        !input.captured &&
        elapsedHours(input.razorpayCreatedAt, input.now) >= input.autoReversalWindowHours
      ) {
        return {
          verdict: "ESCALATE",
          ruleId: "R5",
          explanation:
            `Payment ${input.razorpayPaymentId} has been authorized and not captured for longer than the ` +
            `configured ${input.autoReversalWindowHours}-hour reversal window, and no reversal has been observed ` +
            `yet. This is outside the normal pattern — flagging for a human to check the Razorpay Dashboard ` +
            `directly rather than guessing.`,
          groundedFields: groundedFields(input),
        };
      }
      return null;
    },
  },
  {
    id: "R6",
    reasoning:
      "Prevents a second, redundant refund on an already-resolved payment.",
    check: (input) => {
      const alreadyResolved =
        input.status === "refunded" ||
        input.status === "partially_refunded" ||
        input.status === "auto_reversed";
      if (alreadyResolved && isMoneyAction(input.requestedAction)) {
        return {
          verdict: "BLOCK",
          ruleId: "R6",
          explanation:
            `Payment ${input.razorpayPaymentId} is already "${input.status}" (as of the last check, ${input.now}). ` +
            `Issuing another refund or compensation now would risk paying the customer twice on a payment that's ` +
            `already resolved. This is blocked — if the customer disputes that they were made whole, escalate to ` +
            `a human for manual review rather than refunding again.`,
          groundedFields: groundedFields(input),
        };
      }
      return null;
    },
  },
  {
    id: "R7",
    reasoning: "Genuinely nothing to protect.",
    check: (input) => {
      if (input.status === "failed") {
        return {
          verdict: "ALLOW",
          ruleId: "R7",
          explanation:
            `Payment ${input.razorpayPaymentId} failed at the bank/UPI level — there is no successful charge to ` +
            `protect against. This is informational only; no refund or compensation action is needed.`,
          groundedFields: groundedFields(input),
        };
      }
      return null;
    },
  },
  {
    id: "R8",
    reasoning: "Unknown combinations never get a guessed verdict.",
    check: (input) => ({
      verdict: "ESCALATE",
      ruleId: "R8",
      explanation:
        `This payment/request combination doesn't match any known safe pattern (status="${input.status}", ` +
        `captured=${input.captured}, requestedAction="${input.requestedAction}"). Rather than guess, this is ` +
        `flagged for a human to review directly.`,
      groundedFields: groundedFields(input),
    }),
  },
];
