// Gemini (Google AI Studio, free tier) adapter. Same shape as
// providers/anthropic.ts — one interchangeable adapter behind the
// AI_PROVIDER switch (Section 17). Enabling it is a matter of setting
// AI_PROVIDER=gemini and AI_API_KEY (a Gemini API key from
// aistudio.google.com/apikey, no billing/credit card required for free-tier
// use), no other code changes.

import type { ExtractContext } from "../extract";

const SYSTEM_PROMPT = `You extract structured data from a support agent's message about a Razorpay payment issue. The message may be in English or Hinglish (Hindi-English code-mixed, written in Latin script).

Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{"intent":"status_check|refund_request|compensation_request|general_complaint|other","payment_reference":"string or null","requested_action":"status_check|refund|compensate|none","language":"en|hi-en|other","confidence":0.0}

Rules:
- payment_reference is ONLY a literal payment/order ID actually present in the text (e.g. "pay_Abc123..." or "order_Abc123..."). If none is mentioned, use null. Never invent one.
- confidence is your genuine confidence in this extraction as a number between 0 and 1, not a fixed value.
- requested_action should reflect what the customer/agent is actually asking for, not what you think should happen.`;

export async function callGemini(
  text: string,
  context: ExtractContext | undefined
): Promise<unknown> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("AI_API_KEY is not configured for AI_PROVIDER=gemini");
  }
  const model = process.env.AI_MODEL || "gemini-2.5-flash-lite";

  const userLines = [`Message: ${text}`];
  if (context?.customerRef) userLines.unshift(`Customer ref: ${context.customerRef}`);
  if (context?.recentPayments?.length) {
    userLines.push(
      `Recent payments for this customer (for context only, do not assume the message refers to any specific one unless it clearly does): ${JSON.stringify(
        context.recentPayments
      )}`
    );
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userLines.join("\n") }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 300,
        },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof rawText !== "string") {
    throw new Error("Gemini response contained no text content");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through to the throw below
      }
    }
    throw new Error("Gemini response was not valid JSON");
  }
}
