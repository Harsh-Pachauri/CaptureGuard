import { afterEach, describe, expect, it, vi } from "vitest";

// Mocked at the provider-call boundary — no real fetch/network call ever
// happens in this file. Mirrors how tests/integration/pipeline.test.ts
// mocks callAnthropic.
const callGeminiMock = vi.fn();
vi.mock("@/lib/ai/providers/gemini", () => ({
  callGemini: (...args: unknown[]) => callGeminiMock(...args),
}));

const { extract } = await import("@/lib/ai/extract");
const { resolveExtraction } = await import("@/lib/ai/index");

const VALID_GEMINI_OUTPUT = {
  intent: "refund_request",
  payment_reference: null,
  requested_action: "refund",
  language: "hi-en",
  confidence: 0.92,
};

describe("Gemini provider — valid structured output passes through the existing schema unchanged", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    callGeminiMock.mockReset();
  });

  it("extract() returns the validated extraction with no error", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockResolvedValue(VALID_GEMINI_OUTPUT);

    const result = await extract("mere paise kat gaye, refund karo");
    expect(callGeminiMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
    expect(result.extraction).toEqual(VALID_GEMINI_OUTPUT);
  });

  it("resolveExtraction reports source: 'ai' for a valid Gemini response", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockResolvedValue(VALID_GEMINI_OUTPUT);

    const result = await resolveExtraction("mere paise kat gaye, refund karo", undefined, 0.7);
    expect(result.source).toBe("ai");
    expect(result.extraction.requested_action).toBe("refund");
  });
});

describe("Gemini provider — malformed output is rejected safely, never trusted", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    callGeminiMock.mockReset();
  });

  it("rejects a response with an invalid enum value", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockResolvedValue({ ...VALID_GEMINI_OUTPUT, intent: "not_a_real_intent" });

    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
    expect(result.error).toMatch(/schema validation/i);
  });

  it("rejects a response missing a required field", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    const { confidence: _confidence, ...incomplete } = VALID_GEMINI_OUTPUT;
    void _confidence;
    callGeminiMock.mockResolvedValue(incomplete);

    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("rejects a response with confidence outside [0,1]", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockResolvedValue({ ...VALID_GEMINI_OUTPUT, confidence: 1.7 });

    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
  });

  it("rejects non-object garbage without throwing", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockResolvedValue("this is not even an object");

    await expect(extract("refund please")).resolves.not.toThrow();
    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
  });

  it("resolveExtraction falls back to the deterministic matcher when Gemini output is malformed, and the app keeps answering", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockResolvedValue({ intent: "refund_request" }); // missing required fields

    const result = await resolveExtraction("refund karo please", undefined, 0.7);
    expect(result.source).toBe("fallback");
    expect(result.extraction).not.toBeNull();
    expect(result.aiError).toBeTruthy();
  });
});

describe("Gemini provider — call failure falls back safely", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    callGeminiMock.mockReset();
  });

  it("extract() returns a null extraction with a populated error when the call rejects, never throws", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockRejectedValue(new Error("Gemini API error 404: model not found"));

    await expect(extract("refund please")).resolves.not.toThrow();
    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
    expect(result.error).toContain("404");
  });

  it("resolveExtraction falls back to the deterministic matcher when the Gemini call fails", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    callGeminiMock.mockRejectedValue(new Error("network unreachable"));

    const result = await resolveExtraction("refund karo please", undefined, 0.7);
    expect(result.source).toBe("fallback");
    expect(result.extraction).not.toBeNull();
    expect(result.extraction.requested_action).toBe("refund");
    expect(result.aiError).toContain("network unreachable");
  });

  it("never calls callGemini when AI_PROVIDER=none (confirms the mock isn't accidentally invoked elsewhere)", async () => {
    vi.stubEnv("AI_PROVIDER", "none");
    await resolveExtraction("refund karo please", undefined, 0.7);
    expect(callGeminiMock).not.toHaveBeenCalled();
  });
});
