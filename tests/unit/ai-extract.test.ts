import { afterEach, describe, expect, it, vi } from "vitest";
import { extract } from "@/lib/ai/extract";
import { resolveExtraction } from "@/lib/ai/index";

describe("AIExtractionService.extract — AI_PROVIDER=none", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a null extraction with no error when no provider is configured (a supported, intentional mode)", async () => {
    vi.stubEnv("AI_PROVIDER", "none");
    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
    expect(result.error).toBeNull();
  });

  it("treats an unset AI_PROVIDER the same as 'none' rather than crashing", async () => {
    vi.stubEnv("AI_PROVIDER", "");
    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
  });
});

describe("AIExtractionService.extract — unreachable/unknown provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("degrades to a null extraction with a populated error, never throws, for an unsupported provider id", async () => {
    vi.stubEnv("AI_PROVIDER", "some-unsupported-provider");
    await expect(extract("refund please")).resolves.not.toThrow();
    const result = await extract("refund please");
    expect(result.extraction).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe("resolveExtraction — end-to-end fallback behavior (Section 12 #6/#7)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the deterministic matcher when AI is unconfigured, and the app keeps answering", async () => {
    vi.stubEnv("AI_PROVIDER", "none");
    const result = await resolveExtraction("refund karo please", undefined, 0.7);
    expect(result.source).toBe("fallback");
    expect(result.extraction).not.toBeNull();
    expect(result.extraction.requested_action).toBe("refund");
  });

  it("falls back to the deterministic matcher when the configured provider fails, and always returns a usable extraction", async () => {
    vi.stubEnv("AI_PROVIDER", "some-unsupported-provider");
    const result = await resolveExtraction("refund karo please", undefined, 0.7);
    expect(result.source).toBe("fallback");
    expect(result.aiError).toBeTruthy();
    expect(result.extraction).not.toBeNull();
  });
});
