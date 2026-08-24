import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { GET: listPayments } = await import("@/app/api/payments/route");
const { NextRequest } = await import("next/server");

const TEST_PASSWORD = "test-admin-password";

// Controls its own known password/hash pair rather than relying on
// tests/setup/env.ts's fallback, which .env overrides in local dev the
// same way it overrides INTERNAL_API_TOKEN.
beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD_HASH", hashPassword(TEST_PASSWORD));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function buildRequest(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(url, init);
}

function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  return setCookie.split(";")[0]; // "captureguard_session=<sealed>"
}

describe("POST /api/auth/login", () => {
  it("rejects a wrong password with 401 and sets no session cookie", async () => {
    const res = await login(
      buildRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "definitely-wrong" }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the correct password and sets an HttpOnly session cookie", async () => {
    const res = await login(
      buildRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("captureguard_session=");
  });
});

describe("Protected API routes — session cookie or bearer token, unauthenticated is rejected", () => {
  it("an unauthenticated request (no cookie, no bearer token) gets 401", async () => {
    const res = await listPayments(buildRequest("http://localhost/api/payments"));
    expect(res.status).toBe(401);
  });

  it("a valid session cookie from login authenticates the request", async () => {
    const loginRes = await login(
      buildRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
    );
    const cookie = extractCookie(loginRes);
    expect(cookie).toBeTruthy();

    const res = await listPayments(
      buildRequest("http://localhost/api/payments", { headers: { cookie: cookie! } })
    );
    expect(res.status).toBe(200);
  });

  it("the existing bearer token still authenticates — server-to-server path is preserved", async () => {
    const res = await listPayments(
      buildRequest("http://localhost/api/payments", {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` },
      })
    );
    expect(res.status).toBe(200);
  });

  it("an invalid/garbage cookie value does not authenticate and falls through to 401", async () => {
    const res = await listPayments(
      buildRequest("http://localhost/api/payments", {
        headers: { cookie: "captureguard_session=not-a-real-sealed-value" },
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie so a subsequent request with it is rejected", async () => {
    const loginRes = await login(
      buildRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
    );
    const cookie = extractCookie(loginRes)!;

    // Confirm the session is actually live before logging out.
    const before = await listPayments(
      buildRequest("http://localhost/api/payments", { headers: { cookie } })
    );
    expect(before.status).toBe(200);

    const logoutRes = await logout(buildRequest("http://localhost/api/auth/logout", { method: "POST", headers: { cookie } }));
    expect(logoutRes.status).toBe(200);
    const clearedCookie = logoutRes.headers.get("set-cookie");
    expect(clearedCookie).toBeTruthy();
    // Destroyed cookies are set with an expiry in the past / empty value.
    expect(clearedCookie).toMatch(/captureguard_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
