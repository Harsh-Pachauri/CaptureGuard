import { describe, expect, it } from "vitest";
import { decide } from "@/lib/decision-engine/engine";
import type { DecisionInput } from "@/lib/decision-engine/types";

const NOW = "2026-08-23T12:00:00.000Z";

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    razorpayPaymentId: "pay_TEST0000000001",
    status: "captured",
    captured: true,
    amount: 50000,
    currency: "INR",
    razorpayCreatedAt: "2026-08-23T10:00:00.000Z",
    now: NOW,
    autoReversalWindowHours: 24,
    requestedAction: "refund",
    matchConfidence: 1,
    matchThreshold: 0.7,
    sourceAvailable: true,
    existingRefundOnRecord: false,
    ...overrides,
  };
}

function hoursAgo(hours: number, from = NOW): string {
  return new Date(new Date(from).getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe("DecisionEngine — R0 (source unavailable)", () => {
  it("ESCALATEs when the live Razorpay fetch failed, regardless of everything else", () => {
    const d = decide(baseInput({ sourceAvailable: false, status: "captured" }));
    expect(d.verdict).toBe("ESCALATE");
    expect(d.ruleId).toBe("R0");
  });

  it("takes priority over a status that would otherwise ALLOW", () => {
    const d = decide(
      baseInput({ sourceAvailable: false, requestedAction: "status_check" })
    );
    expect(d.ruleId).toBe("R0");
  });
});

describe("DecisionEngine — R1 (confidence gating)", () => {
  it("ESCALATEs when match confidence is below threshold", () => {
    const d = decide(baseInput({ matchConfidence: 0.5, matchThreshold: 0.7 }));
    expect(d.verdict).toBe("ESCALATE");
    expect(d.ruleId).toBe("R1");
  });

  it("ESCALATEs when there is no match at all (null confidence)", () => {
    const d = decide(baseInput({ matchConfidence: null }));
    expect(d.verdict).toBe("ESCALATE");
    expect(d.ruleId).toBe("R1");
  });

  it("boundary: confidence exactly at threshold is treated as confident (does not fire R1)", () => {
    const d = decide(baseInput({ matchConfidence: 0.7, matchThreshold: 0.7 }));
    expect(d.ruleId).not.toBe("R1");
  });

  it("fires before R4 even when the underlying state would otherwise BLOCK — confidence gating takes priority over payment state", () => {
    const d = decide(
      baseInput({
        matchConfidence: 0.3,
        status: "authorized",
        captured: false,
        requestedAction: "refund",
        razorpayCreatedAt: hoursAgo(1),
      })
    );
    expect(d.ruleId).toBe("R1");
    expect(d.verdict).toBe("ESCALATE");
  });
});

describe("DecisionEngine — R2 (status_check always ALLOW)", () => {
  it("ALLOWs a status_check even while inside the danger window", () => {
    const d = decide(
      baseInput({
        requestedAction: "status_check",
        status: "authorized",
        captured: false,
        razorpayCreatedAt: hoursAgo(1),
      })
    );
    expect(d.verdict).toBe("ALLOW");
    expect(d.ruleId).toBe("R2");
  });
});

describe("DecisionEngine — R3 (ordinary captured refund)", () => {
  it("ALLOWs a refund on a captured payment with no existing refund", () => {
    const d = decide(
      baseInput({ status: "captured", captured: true, existingRefundOnRecord: false })
    );
    expect(d.verdict).toBe("ALLOW");
    expect(d.ruleId).toBe("R3");
  });

  it("does NOT re-ALLOW when captured but a refund already exists on record (must not double-ALLOW)", () => {
    const d = decide(
      baseInput({ status: "captured", captured: true, existingRefundOnRecord: true })
    );
    expect(d.verdict).not.toBe("ALLOW");
  });

  it("ALLOWs a compensation request the same way as a refund request", () => {
    const d = decide(
      baseInput({ status: "captured", requestedAction: "compensate", existingRefundOnRecord: false })
    );
    expect(d.ruleId).toBe("R3");
  });
});

describe("DecisionEngine — R4 (the central BLOCK case)", () => {
  it("BLOCKs a refund request while authorized, uncaptured, inside the window", () => {
    const d = decide(
      baseInput({
        status: "authorized",
        captured: false,
        razorpayCreatedAt: hoursAgo(1),
        autoReversalWindowHours: 24,
        requestedAction: "refund",
      })
    );
    expect(d.verdict).toBe("BLOCK");
    expect(d.ruleId).toBe("R4");
    expect(d.explanation).toContain("pay_TEST0000000001");
  });

  it("boundary: one minute before the window elapses still BLOCKs", () => {
    const d = decide(
      baseInput({
        status: "authorized",
        captured: false,
        autoReversalWindowHours: 1,
        razorpayCreatedAt: hoursAgo(1 - 1 / 60),
      })
    );
    expect(d.ruleId).toBe("R4");
    expect(d.verdict).toBe("BLOCK");
  });

  it("boundary: one minute after the window elapses falls to R5 (ESCALATE), never silently ALLOWs", () => {
    const d = decide(
      baseInput({
        status: "authorized",
        captured: false,
        autoReversalWindowHours: 1,
        razorpayCreatedAt: hoursAgo(1 + 1 / 60),
      })
    );
    expect(d.ruleId).toBe("R5");
    expect(d.verdict).toBe("ESCALATE");
    expect(d.verdict).not.toBe("ALLOW");
  });
});

describe("DecisionEngine — R5 (past-window escalation)", () => {
  it("ESCALATEs when authorized+uncaptured has exceeded the window with no reversal observed", () => {
    const d = decide(
      baseInput({
        status: "authorized",
        captured: false,
        autoReversalWindowHours: 24,
        razorpayCreatedAt: hoursAgo(48),
      })
    );
    expect(d.verdict).toBe("ESCALATE");
    expect(d.ruleId).toBe("R5");
  });

  it("still ESCALATEs for a pure status_check past the window? No — R2 fires first for status_check", () => {
    const d = decide(
      baseInput({
        status: "authorized",
        captured: false,
        autoReversalWindowHours: 24,
        razorpayCreatedAt: hoursAgo(48),
        requestedAction: "status_check",
      })
    );
    expect(d.ruleId).toBe("R2");
    expect(d.verdict).toBe("ALLOW");
  });
});

describe("DecisionEngine — R6 (already-resolved double-refund prevention)", () => {
  for (const status of ["refunded", "partially_refunded", "auto_reversed"] as const) {
    it(`BLOCKs a second refund/compensation attempt when status is already "${status}"`, () => {
      const d = decide(baseInput({ status, requestedAction: "refund" }));
      expect(d.verdict).toBe("BLOCK");
      expect(d.ruleId).toBe("R6");
    });
  }

  it("BLOCKs a compensation attempt the same way as a refund attempt", () => {
    const d = decide(baseInput({ status: "refunded", requestedAction: "compensate" }));
    expect(d.ruleId).toBe("R6");
  });
});

describe("DecisionEngine — R7 (failed payment, informational only)", () => {
  it("ALLOWs an informational response for a failed payment", () => {
    const d = decide(baseInput({ status: "failed", requestedAction: "status_check" }));
    // R2 fires first for status_check, which is also correct (ALLOW either way).
    expect(d.verdict).toBe("ALLOW");
  });

  it("ALLOWs even a refund 'request' against a failed payment (informational path, R7)", () => {
    const d = decide(baseInput({ status: "failed", requestedAction: "refund" }));
    expect(d.verdict).toBe("ALLOW");
    expect(d.ruleId).toBe("R7");
  });
});

describe("DecisionEngine — R8 (unknown combination default)", () => {
  it("ESCALATEs for an unknown status string rather than throwing", () => {
    expect(() =>
      decide(baseInput({ status: "unknown", requestedAction: "refund" }))
    ).not.toThrow();
    const d = decide(baseInput({ status: "unknown", requestedAction: "refund" }));
    expect(d.verdict).toBe("ESCALATE");
    expect(d.ruleId).toBe("R8");
  });

  it("ESCALATEs for status=created with a money action (not yet authorized, not a known safe pattern)", () => {
    const d = decide(baseInput({ status: "created", captured: false, requestedAction: "refund" }));
    expect(d.verdict).toBe("ESCALATE");
    expect(d.ruleId).toBe("R8");
  });

  it("never throws for any status value", () => {
    const statuses: DecisionInput["status"][] = [
      "created",
      "authorized",
      "captured",
      "failed",
      "refunded",
      "partially_refunded",
      "auto_reversed",
      "unknown",
    ];
    for (const status of statuses) {
      for (const requestedAction of ["refund", "compensate", "status_check", "other"] as const) {
        expect(() => decide(baseInput({ status, requestedAction }))).not.toThrow();
      }
    }
  });
});

describe("DecisionEngine — general guarantees", () => {
  it("groundedFields always cites the real payment id and status the verdict was computed from", () => {
    const d = decide(baseInput());
    expect(d.groundedFields.razorpayPaymentId).toBe("pay_TEST0000000001");
    expect(d.groundedFields).toHaveProperty("status");
    expect(d.groundedFields).toHaveProperty("amount");
  });

  it("is a pure function — same input always produces the same output", () => {
    const input = baseInput({ status: "authorized", captured: false, razorpayCreatedAt: hoursAgo(1) });
    const d1 = decide(input);
    const d2 = decide(input);
    expect(d1).toEqual(d2);
  });
});
