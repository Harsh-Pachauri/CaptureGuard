import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/**
 * Server-side defense-in-depth for the Judge Demo restriction, mirroring
 * app/dev/layout.tsx's existing pattern (proxy.ts's own comment already
 * documents itself as "optimistic only" — real enforcement belongs here).
 * The shared (dashboard)/layout.tsx above this already checks
 * isLoggedIn; this only adds the role check on top of that, so an
 * already-authenticated judge session can never render the Admin page
 * even if proxy were bypassed entirely.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session.role === "judge") {
    redirect("/test-lab");
  }

  return <>{children}</>;
}
