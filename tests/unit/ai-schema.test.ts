import { describe, expect, it } from "vitest";
import { validateExtraction } from "@/lib/ai/schema";

const VALID = {
  intent: "refund_request",
  payment_reference: null,
  requested_action: "refund",
  language: "hi-en",
  confidence: 0.74,
};

describe("AI structured-output validation", () => {
  it("accepts a fully valid extraction", () => {
    const result = validateExtraction(VALID);
    expect(result.valid).toBe(true);
  });

  it("rejects malformed JSON-like input (not an object)", () => {
    const result = validateExtraction("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects a response missing a required field", () => {
    const { confidence, ...rest } = VALID;
    void confidence;
    const result = validateExtraction(rest);
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid enum value for intent", () => {
    const result = validateExtraction({ ...VALID, intent: "hacking_attempt" });
    expect(result.valid).toBe(false);
  });

  it("rejects confidence above 1", () => {
    const result = validateExtraction({ ...VALID, confidence: 1.5 });
    expect(result.valid).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const result = validateExtraction({ ...VALID, confidence: -0.1 });
    expect(result.valid).toBe(false);
  });

  it("accepts confidence at the 0 and 1 boundaries", () => {
    expect(validateExtraction({ ...VALID, confidence: 0 }).valid).toBe(true);
    expect(validateExtraction({ ...VALID, confidence: 1 }).valid).toBe(true);
  });

  it("accepts a valid-but-low-confidence response without silently upgrading it", () => {
    const result = validateExtraction({ ...VALID, confidence: 0.1 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.confidence).toBe(0.1);
    }
  });

  it("allows payment_reference to be an explicit string", () => {
    const result = validateExtraction({ ...VALID, payment_reference: "pay_ABC123456" });
    expect(result.valid).toBe(true);
  });

  it("rejects payment_reference of the wrong type", () => {
    const result = validateExtraction({ ...VALID, payment_reference: 12345 });
    expect(result.valid).toBe(false);
  });
});
