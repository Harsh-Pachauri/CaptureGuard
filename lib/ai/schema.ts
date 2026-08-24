import { z } from "zod";

// The structured-output contract from Section 9 of the blueprint. This is
// the entire AI surface — nothing outside this shape is ever trusted from
// an AI response.
export const IntentExtractionSchema = z.object({
  intent: z.enum([
    "status_check",
    "refund_request",
    "compensation_request",
    "general_complaint",
    "other",
  ]),
  payment_reference: z.string().nullable(),
  requested_action: z.enum(["status_check", "refund", "compensate", "none"]),
  language: z.enum(["en", "hi-en", "other"]),
  confidence: z.number().min(0).max(1),
});

export type IntentExtraction = z.infer<typeof IntentExtractionSchema>;

export type ValidationResult =
  | { valid: true; data: IntentExtraction }
  | { valid: false; error: string };

/**
 * Deterministic validation before use: type/enum-membership/range checks. A
 * response that fails this is treated identically to a low-confidence
 * response upstream — never trusted, never partially trusted.
 */
export function validateExtraction(raw: unknown): ValidationResult {
  const result = IntentExtractionSchema.safeParse(raw);
  if (!result.success) {
    return { valid: false, error: result.error.issues.map((i) => i.message).join("; ") };
  }
  return { valid: true, data: result.data };
}
