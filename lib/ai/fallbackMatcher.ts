import type { IntentExtraction } from "./schema";

// Deterministic keyword-fallback matcher (SHOULD-have, Section 1/12/17):
// used whenever the AI service is unreachable, unconfigured
// (AI_PROVIDER=none), or returns output that fails schema validation. Its
// job is narrow — recognize a handful of common English/Hinglish phrasings
// well enough to route the obvious cases, and stay deliberately
// under-confident everywhere else so the system escalates more instead of
// silently guessing. Confidence here is capped at 0.6, below the default
// 0.7 match threshold — on purpose, so R1 (confidence gating) still governs
// unless a merchant has explicitly lowered their threshold.

const REFUND_PATTERNS = [
  /\brefund\b/i,
  /paisa\s*wapa?s/i,
  /paise\s*wapa?s/i,
  /\bwapis\b/i,
  /money\s*back/i,
  /paisa\s*(vaapas|vapas)/i,
];

const COMPENSATE_PATTERNS = [/compensat/i, /muawza/i, /muaawza/i];

const STATUS_PATTERNS = [
  /\bstatus\b/i,
  /kitna\s*time/i,
  /kab\s*tak/i,
  /kya\s*hua/i,
  /order\s*failed/i,
  /how\s*long/i,
  /\bpending\b/i,
];

const HINGLISH_TOKENS =
  /\b(bhai|hai|kar|karo|kyun|kyu|nahi|nahin|paisa|paise|mera|meri|wapas|wapis|dikha|raha|rahi|gaya|gayi|hua|hui|ho|kab|tak|kitna|kya)\b/i;

const REFERENCE_PATTERN = /\b((?:pay|order)_[A-Za-z0-9]{8,})\b/;

function detectLanguage(text: string): IntentExtraction["language"] {
  return HINGLISH_TOKENS.test(text) ? "hi-en" : "en";
}

function extractPaymentReference(text: string): string | null {
  const match = text.match(REFERENCE_PATTERN);
  return match ? match[1] : null;
}

export interface FallbackExtraction extends IntentExtraction {
  source: "fallback";
}

export function fallbackExtract(text: string): FallbackExtraction {
  const matchesAny = (patterns: RegExp[]) => patterns.some((p) => p.test(text));

  let intent: IntentExtraction["intent"];
  let requested_action: IntentExtraction["requested_action"];
  let confidence: number;

  if (matchesAny(REFUND_PATTERNS)) {
    intent = "refund_request";
    requested_action = "refund";
    confidence = 0.6;
  } else if (matchesAny(COMPENSATE_PATTERNS)) {
    intent = "compensation_request";
    requested_action = "compensate";
    confidence = 0.6;
  } else if (matchesAny(STATUS_PATTERNS)) {
    intent = "status_check";
    requested_action = "status_check";
    confidence = 0.6;
  } else {
    intent = "general_complaint";
    requested_action = "none";
    confidence = 0.3;
  }

  return {
    intent,
    payment_reference: extractPaymentReference(text),
    requested_action,
    language: detectLanguage(text),
    confidence,
    source: "fallback",
  };
}
