// Resets and pushes the Prisma schema to the dedicated CaptureGuard-test
// PostgreSQL database — read from TEST_DATABASE_URL / TEST_DIRECT_URL,
// never DATABASE_URL / DIRECT_URL (CaptureGuard-dev) or anything
// CaptureGuard-prod. `--force-reset` drops and recreates the schema so
// every `npm test` run starts from a clean, known, empty database — tests
// must not depend on (or accumulate) state from a previous run. This is
// the hosted-Postgres equivalent of the old SQLite setup's "delete
// test.db before every run." Run automatically via npm's `pretest` hook.
import { execSync } from "node:child_process";
import { config } from "dotenv";

config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDirectUrl = process.env.TEST_DIRECT_URL;

if (!testDatabaseUrl || !testDirectUrl) {
  console.error(
    "TEST_DATABASE_URL and TEST_DIRECT_URL must be set in .env — CaptureGuard-test's pooled and direct " +
      "connection strings (from Prisma Console → CaptureGuard-test → Connect)."
  );
  process.exit(1);
}

execSync("npx prisma db push --skip-generate --accept-data-loss --force-reset", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDirectUrl },
});
