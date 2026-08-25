import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";

const { POST: judgeLogin } = await import("@/app/api/auth/judge-login/route");
const { POST: adminLogin } = await import("@/app/api/auth/login/route");
const { GET: listPayments } = await import("@/app/api/payments/route");
const { PATCH: patchConfig } = await import("@/app/api/config/route");
const { default: proxy } = await import("@/proxy");
const { NextRequest } = await import("next/server");

const TEST_JUDGE_CODE = "test-judge-code";
const TEST_ADMIN_PASSWORD = "test-admin-password";

beforeEach(() => {
  vi.stubEnv("JUDGE_ACCESS_CODE_HASH", hashPassword(TEST_JUDGE_CODE));
  vi.stubEnv("ADMIN_PASSWORD_HASH", hashPassword(TEST_ADMIN_PASSWORD));
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
  return setCookie.split(";")[0];
}

async function judgeCookie(): Promise<string> {
  const res = await judgeLogin(
    buildRequest("http://localhost/api/auth/judge-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: TEST_JUDGE_CODE }),
    })
  );
  return extractCookie(res)!;
}

async function adminCookie(): Promise<string> {
  const res = await adminLogin(
    buildRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: TEST_ADMIN_PASSWORD }),
    })
  );
  return extractCookie(res)!;
}

describe("POST /api/auth/judge-login", () => {
  it("rejects a wrong access code with 401 and sets no session cookie", async () => {
    const res = await judgeLogin(
      buildRequest("http://localhost/api/auth/judge-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "definitely-wrong" }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the correct code and sets an HttpOnly session cookie, same shape as admin login", async () => {
    const res = await judgeLogin(
      buildRequest("http://localhost/api/auth/judge-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: TEST_JUDGE_CODE }),
      })
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("captureguard_session=");
  });

  it("does not authenticate against the real admin password", async () => {
    const res = await judgeLogin(
      buildRequest("http://localhost/api/auth/judge-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: TEST_ADMIN_PASSWORD }),
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("Judge session — restricted access", () => {
  it("a judge session authenticates ordinary protected API routes, same as admin", async () => {
    const cookie = await judgeCookie();
    const res = await listPayments(buildRequest("http://localhost/api/payments", { headers: { cookie } }));
    expect(res.status).toBe(200);
  });

  it("a judge session is rejected (403) from PATCH /api/config — cannot change production configuration", async () => {
    const cookie = await judgeCookie();
    const res = await patchConfig(
      buildRequest("http://localhost/api/config", {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ autoReversalWindowHours: 999 }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("an admin session can still PATCH /api/config — the judge restriction does not regress admin", async () => {
    const cookie = await adminCookie();
    const res = await patchConfig(
      buildRequest("http://localhost/api/config", {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ autoReversalWindowHours: 24 }),
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("proxy — Judge Demo route gating", () => {
  it("redirects a judge session away from /admin to /test-lab", async () => {
    const cookie = await judgeCookie();
    const res = await proxy(
      buildRequest("http://localhost/admin", { headers: { cookie } })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/test-lab");
  });

  it("does not redirect an admin session away from /admin — unchanged from before", async () => {
    const cookie = await adminCookie();
    const res = await proxy(
      buildRequest("http://localhost/admin", { headers: { cookie } })
    );
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it("still redirects an unauthenticated /admin visit to /login, unchanged from before", async () => {
    const res = await proxy(buildRequest("http://localhost/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("redirects an unauthenticated /test-lab visit to /judge, not /login", async () => {
    const res = await proxy(buildRequest("http://localhost/test-lab"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/judge");
  });

  it("a logged-in judge visiting /judge is redirected to /test-lab", async () => {
    const cookie = await judgeCookie();
    const res = await proxy(buildRequest("http://localhost/judge", { headers: { cookie } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/test-lab");
  });

  it("an unauthenticated /judge visit passes through (public entry point)", async () => {
    const res = await proxy(buildRequest("http://localhost/judge"));
    expect(res.status).toBe(200);
  });
});
