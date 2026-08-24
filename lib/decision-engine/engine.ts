import { RULES } from "./rules";
import type { Decision, DecisionInput } from "./types";

export type { Decision, DecisionInput, Verdict, PaymentStatus, RequestedAction } from "./types";

/**
 * Pure, deterministic, fully unit-testable without any network or DB call.
 * Implements Section 8's rule table exactly: R0..R8, first match wins.
 *
 * This function has zero I/O and zero AI involvement by construction — it
 * only accepts already-resolved, already-validated data. Every caller is
 * responsible for live-fetching the payment and validating the match before
 * calling this.
 */
export function decide(input: DecisionInput): Decision {
  for (const rule of RULES) {
    const result = rule.check(input);
    if (result) return result;
  }
  // Unreachable: R8 is an unconditional catch-all. If this throws, a rule
  // was edited to no longer be a total function — treat as a bug, not a
  // runtime case to design around.
  throw new Error("DecisionEngine: no rule matched (R8 should always fire)");
}
