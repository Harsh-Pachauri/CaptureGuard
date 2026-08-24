// Runs before every test file: points the Prisma client at the dedicated
// CaptureGuard-test PostgreSQL database — read from TEST_DATABASE_URL /
// TEST_DIRECT_URL specifically, never the DATABASE_URL / DIRECT_URL pair
// `npm run dev` uses (CaptureGuard-dev) — so running tests can never touch
// dev or prod data. Also defaults AI_PROVIDER to "none" unless a test
// explicitly overrides it.
import { config } from "dotenv";

config(); // loads .env from process.cwd() — always the project root under `npm test`

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
