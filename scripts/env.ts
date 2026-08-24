// Standalone scripts run under `tsx` directly (not through Next.js, which
// auto-loads .env itself) — tsx does NOT load .env files on its own. Prisma
// happens to load .env internally as a side effect of instantiating
// PrismaClient, which is why DB-touching scripts "worked" without this, but
// any script that doesn't touch Prisma (e.g. one that only calls the
// Razorpay API) got a silently empty process.env. Import this file FIRST,
// before any other project import, in every standalone script under
// /scripts that reads process.env.
//
// Resolved relative to this file, not process.cwd(), so `npx tsx
// scripts/whatever.ts` behaves the same regardless of which directory it's
// invoked from.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env") });
