// Resets and pushes the Prisma schema to a dedicated SQLite file used only
// by integration tests, kept separate from the dev.db an agent might be
// looking at in the running app. Deletes any existing test.db first so
// every `npm test` run starts from a clean, empty database — tests must not
// depend on (or accumulate) state from a previous run. Run automatically
// via npm's `pretest` hook before `npm test`.
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  const path = `./prisma/test.db${suffix}`;
  if (existsSync(path)) rmSync(path);
}

execSync("npx prisma db push --skip-generate --accept-data-loss", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
});
