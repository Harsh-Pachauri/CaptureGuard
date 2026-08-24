// One-off setup utility (not part of the request path): generates the
// scrypt hash to put in ADMIN_PASSWORD_HASH. Never sends the plaintext
// password anywhere — prints only the hash, to your own terminal.
//
// Usage: npx tsx scripts/hash-admin-password.ts "your chosen password"
import { hashPassword } from "../lib/auth/password";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npx tsx scripts/hash-admin-password.ts "your chosen password"');
  process.exit(1);
}

console.log(hashPassword(password));
