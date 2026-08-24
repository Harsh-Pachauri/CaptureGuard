// Runs before every test file: points the Prisma client at the dedicated
// test SQLite database (see scripts/setup-test-db.mjs) instead of dev.db,
// and defaults AI_PROVIDER to "none" unless a test explicitly overrides it.
process.env.DATABASE_URL = "file:./prisma/test.db";
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? "none";
process.env.INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN ?? "test-internal-token";
