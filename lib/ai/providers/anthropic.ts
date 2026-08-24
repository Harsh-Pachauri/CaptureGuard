// Anthropic (Claude) adapter. Wired and ready — enabling it is a matter of
// setting AI_PROVIDER=anthropic and AI_API_KEY, no code changes. This is one
// interchangeable adapter behind the AI_PROVIDER switch (Section 17); adding
// openai.ts / gemini.ts later follows the same shape.

import type { ExtractContext } from "../extract";

const SYSTEM_PROMPT = `You extract structured data from a support agent's message about a Razorpay payment issue. The message may be in English or Hinglish (Hindi-English code-mixed, written in Latin script).

Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{"intent":"status_check|refund_request|compensation_request|general_complaint|other","payment_reference":"string or null","requested_action":"status_check|refund|compensate|none","language":"en|hi-en|other","confidence":0.0}

Rules:
- payment_reference is ONLY a literal payment/order ID actually present in the text (e.g. "pay_Abc123..." or "order_Abc123..."). If none is mentioned, use null. Never invent one.
- confidence is your genuine confidence in this extraction as a number between 0 and 1, not a fixed value.
- requested_action should reflect what the customer/agent is actually asking for, not what you think should happen.`;

export async function callAnthropic(
  text: string,
  context: ExtractContext | undefined
): Promise<unknown> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("AI_API_KEY is not configured for AI_PROVIDER=anthropic");
  }
  const model = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

  const userLines = [`Message: ${text}`];
  if (context?.customerRef) userLines.unshift(`Customer ref: ${context.customerRef}`);
  if (context?.recentPayments?.length) {
    userLines.push(
      `Recent payments for this customer (for context only, do not assume the message refers to any specific one unless it clearly does): ${JSON.stringify(
        context.recentPayments
      )}`
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userLines.join("\n") }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const textBlock = data.content?.find((c) => c.type === "text");
  const rawText = textBlock?.text;
  if (typeof rawText !== "string") {
    throw new Error("Anthropic response contained no text content");
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
    throw new Error("Anthropic response was not valid JSON");
  }
}
