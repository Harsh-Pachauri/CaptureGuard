"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Nav } from "./Nav";

// Route-prefix → ambient tier, matching the priority order the ambient
// gradient system was designed around (see app/globals.css): Overview
// slightly more present than Decision Panel/Inbox, everything else
// (Payments, Payment Detail, Audit, Evaluation, Admin) falls back to the
// lightest, most neutral tier.
const AMBIENT_TIER_BY_PREFIX: Array<[string, string]> = [
  ["/overview", "ambient-overview"],
  ["/test-lab", "ambient-overview"],
  ["/inbox", "ambient-decision"],
];

function ambientTierFor(pathname: string | null): string {
  return AMBIENT_TIER_BY_PREFIX.find(([prefix]) => pathname?.startsWith(prefix))?.[1] ?? "ambient-neutral";
}

/**
 * Purely presentational shell shared by every authenticated page — the
 * actual auth gate (getSession/redirect) stays server-side in
 * app/(dashboard)/layout.tsx, which renders this and passes children
 * through untouched. Only reason this needs to be a client component is
 * usePathname(), used to vary the ambient background's intensity by
 * section without duplicating this markup once per page.
 *
 * `role` is optional and only ever "judge" (Judge Demo sessions) —
 * admin/undefined renders exactly as before, unchanged.
 */
export function DashboardShell({ children, role }: { children: ReactNode; role?: "judge" }) {
  const pathname = usePathname();
  const tier = ambientTierFor(pathname);

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 ${tier}`}>
      <Nav role={role} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
