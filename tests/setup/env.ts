// Runs before every test file: points the Prisma client at the dedicated
// CaptureGuard-test PostgreSQL database — read from TEST_DATABASE_URL /
// TEST_DIRECT_URL specifically, never the DATABASE_URL / DIRECT_URL pair
// `npm run dev` uses (CaptureGuard-dev) — so running tests can never touch
// dev or prod data. Also defaults AI_PROVIDER to "none" unless a test
// explicitly overrides it.
import { config } from "dotenv";
import { vi } from "vitest";

config(); // loads .env from process.cwd() — always the project root under `npm test`

// server-only's real implementation unconditionally throws — Next's own
// bundler special-cases it away for actual server builds, but vitest has no
// such bundler-level swap, so it throws for real here. Stubbing it as a
// no-op only affects the test runner; it does not weaken the real
// production guard (lib/auth/session.ts is still never importable from a
// "use client" file in an actual Next.js build).
vi.mock("server-only", () => ({}));

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_DIRECT_URL) {
  throw new Error(
    "TEST_DATABASE_URL and TEST_DIRECT_URL must be set in .env — CaptureGuard-test's pooled and direct " +
      "connection strings. The test suite never reuses DATABASE_URL/DIRECT_URL (CaptureGuard-dev) for this."
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? "none";
process.env.INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN ?? "test-internal-token";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-session-secret-at-least-32-characters-long";
process.env.ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ??
  // Real scrypt hash of "test-admin-password" (lib/auth/password.ts) — test-only, never a real credential.
  "503b90c732d947dd4ae977bfe16db560:b1a3c605dc74568f710a3d1fedfefa2dea0fd25b6c8bd6056b0788d483a29d02489b7ceebd48966c08c456cd217bd53cedff1a52a24afbd411ce0bbd965a700e";
