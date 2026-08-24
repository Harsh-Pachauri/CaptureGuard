// Shared between lib/auth/session.ts (Server Components/Route Handlers, via
// next/headers#cookies()) and proxy.ts (reads NextRequest#cookies directly —
// Proxy runs before the request-scoped cookies() context exists). No
// "server-only" import here so both can share it without runtime coupling.
export const SESSION_COOKIE_NAME = "captureguard_session";
