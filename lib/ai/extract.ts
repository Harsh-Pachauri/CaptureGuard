import { validateExtraction, type IntentExtraction } from "./schema";
import { callAnthropic } from "./providers/anthropic";
import { callGemini } from "./providers/gemini";

export interface ExtractContext {
  customerRef?: string;
  recentPayments?: { razorpayPaymentId: string; status: string; amount: number }[];
}

export interface AIExtractionOutcome {
  extraction: IntentExtraction | null;
  belowThreshold: boolean;
  rawOutput: unknown;
  error: string | null;
}

/**
 * AIExtractionService (Section 3). Talks to whichever provider AI_PROVIDER
 * selects, validates the response, and returns either a validated
 * IntentExtraction or null. Never throws — every failure mode (unconfigured,
 * unreachable, timeout, malformed JSON, schema-invalid) collapses to
 * `extraction: null` with `error` describing why, and the caller decides
 * what to do next (lib/ai/index.ts falls back to the deterministic matcher).
 */
export async function extract(
  text: string,
  context?: ExtractContext,
  matchThreshold = 0.7
): Promise<AIExtractionOutcome> {
  const provider = (process.env.AI_PROVIDER ?? "none").toLowerCase();

  if (provider === "" || provider === "none") {
    return { extraction: null, belowThreshold: false, rawOutput: null, error: null };
  }

  let raw: unknown;
  try {
    raw = await callProvider(provider, text, context);
  } catch (err) {
    return {
      extraction: null,
      belowThreshold: false,
      rawOutput: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const validation = validateExtraction(raw);
  if (!validation.valid) {
    return {
      extraction: null,
      belowThreshold: false,
      rawOutput: raw,
      error: `AI output failed schema validation: ${validation.error}`,
    };
  }

  return {
    extraction: validation.data,
    belowThreshold: validation.data.confidence < matchThreshold,
    rawOutput: raw,
    error: null,
  };
}

async function callProvider(
  provider: string,
  text: string,
  context?: ExtractContext
): Promise<unknown> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(text, context);
    case "gemini":
      return callGemini(text, context);
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${provider}" — supported: none, anthropic, gemini`
      );
  }
}
