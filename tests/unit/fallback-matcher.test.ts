import { describe, expect, it } from "vitest";
import { fallbackExtract } from "@/lib/ai/fallbackMatcher";

describe("deterministic keyword-fallback matcher", () => {
  it("recognizes an English refund request", () => {
    const r = fallbackExtract("Please refund this transaction, it never went through.");
    expect(r.intent).toBe("refund_request");
    expect(r.requested_action).toBe("refund");
    expect(r.language).toBe("en");
  });

  it("recognizes a Hinglish refund request and tags the language", () => {
    const r = fallbackExtract("mere paise kat gaye, refund karo");
    expect(r.intent).toBe("refund_request");
    expect(r.requested_action).toBe("refund");
    expect(r.language).toBe("hi-en");
  });

  it("recognizes a Hinglish status-check phrasing", () => {
    const r = fallbackExtract("payment pending hai kitna time lagega?");
    expect(r.intent).toBe("status_check");
    expect(r.requested_action).toBe("status_check");
  });

  it("recognizes the canonical bhai/order-failed phrasing as status intent, not a refund demand", () => {
    const r = fallbackExtract("bhai payment ho gaya but order failed dikha raha hai");
    expect(r.intent).toBe("status_check");
  });

  it("extracts an explicit payment reference when present", () => {
    const r = fallbackExtract("please check pay_ABCDEF123456, refund it");
    expect(r.payment_reference).toBe("pay_ABCDEF123456");
  });

  it("returns null payment_reference when none is mentioned", () => {
    const r = fallbackExtract("refund please");
    expect(r.payment_reference).toBeNull();
  });

  it("stays deliberately low-confidence on unrecognized text (never fabricates certainty)", () => {
    const r = fallbackExtract("asdkjashd random text with no signal");
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("never returns a confidence at or above 0.7 (keeps fallback-derived matches below the default threshold)", () => {
    const samples = [
      "refund karo please",
      "compensation chahiye",
      "kitna time lagega",
      "refund this now",
    ];
    for (const s of samples) {
      expect(fallbackExtract(s).confidence).toBeLessThan(0.7);
    }
  });

  it("is marked with source: fallback so callers can distinguish it from real AI output", () => {
    expect(fallbackExtract("refund please").source).toBe("fallback");
  });
});

describe("deterministic keyword-fallback matcher — explicit action takes precedence over descriptive context", () => {
  // A message can both describe a problem ("order failed", "paisa deduct
  // hua") AND state an explicit requested action ("refund kar do"). The
  // explicit action must win — REFUND_PATTERNS/COMPENSATE_PATTERNS are
  // checked before STATUS_PATTERNS in fallbackExtract() specifically for
  // this. Contrast with the "canonical bhai/order-failed" test above, which
  // has no explicit action and correctly stays status_check.
  const cases: [string, "refund_request" | "status_check"][] = [
    ["bhai payment ho gaya but order failed dikha raha hai, refund kar do", "refund_request"],
    ["payment failed dikha raha hai, refund kar do", "refund_request"],
    ["payment pending hai, kitna time lagega?", "status_check"],
    ["paisa deduct hua hai, status batao", "status_check"],
    ["order fail hua hai, mera paisa wapas karo", "refund_request"],
    ["payment ho gaya but order nahi bana, refund please", "refund_request"],
    ["payment ka status kya hai?", "status_check"],
  ];

  for (const [text, expectedIntent] of cases) {
    it(`"${text}" → ${expectedIntent}`, () => {
      const r = fallbackExtract(text);
      expect(r.intent).toBe(expectedIntent);
      expect(r.requested_action).toBe(expectedIntent === "refund_request" ? "refund" : "status_check");
    });
  }

  it("adding an explicit refund request to the canonical status-only phrasing flips it to refund_request", () => {
    const withoutAction = fallbackExtract("bhai payment ho gaya but order failed dikha raha hai");
    const withAction = fallbackExtract("bhai payment ho gaya but order failed dikha raha hai, refund kar do");
    expect(withoutAction.intent).toBe("status_check");
    expect(withAction.intent).toBe("refund_request");
  });
});
