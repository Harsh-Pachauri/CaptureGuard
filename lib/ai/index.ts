import { extract, type ExtractContext } from "./extract";
import { fallbackExtract } from "./fallbackMatcher";
import type { IntentExtraction } from "./schema";

export type { ExtractContext } from "./extract";
export type { IntentExtraction } from "./schema";

export type ExtractionSource = "ai" | "fallback";

export interface ResolvedExtraction {
  extraction: IntentExtraction;
  source: ExtractionSource;
  rawAiOutput: unknown;
  aiError: string | null;
}

/**
 * The single entry point the rest of the app (support-query pipeline AND
 * the evaluation runner — never a separate copy) uses to go from free text
 * to a structured extraction. Tries the configured AI provider first; if
 * that's unconfigured, unreachable, or returns invalid output, degrades to
 * the deterministic keyword-fallback matcher rather than failing the
 * request. This function always returns *something* usable — it is the
 * Decision Engine's R1 (confidence gating) that decides whether that
 * something is trustworthy enough to act on, not this function.
 */
export async function resolveExtraction(
  text: string,
  context: ExtractContext | undefined,
  matchThreshold: number
): Promise<ResolvedExtraction> {
  const aiResult = await extract(text, context, matchThreshold);

  if (aiResult.extraction) {
    return {
      extraction: aiResult.extraction,
      source: "ai",
      rawAiOutput: aiResult.rawOutput,
      aiError: aiResult.error,
    };
  }

  const fallback = fallbackExtract(text);
  return {
    extraction: fallback,
    source: "fallback",
    rawAiOutput: aiResult.rawOutput,
    aiError: aiResult.error,
  };
}
