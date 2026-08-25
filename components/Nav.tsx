"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/test-lab", label: "Test Lab" },
  { href: "/inbox", label: "Support Inbox" },
  { href: "/payments", label: "Payments" },
  { href: "/audit", label: "Audit Trail" },
  { href: "/eval", label: "Evaluation" },
  { href: "/admin", label: "Admin" },
];

/** `role` is optional and only ever "judge" — admin/undefined shows every link, unchanged from before. */
export function Nav({ role }: { role?: "judge" } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const links = role === "judge" ? LINKS.filter((l) => l.href !== "/admin") : LINKS;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(role === "judge" ? "/judge" : "/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/overview" className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            <Logo size={20} /> CaptureGuard
          </Link>
          {role === "judge" ? (
            <span className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-amber-700 dark:text-amber-400">
              Judge Session
            </span>
          ) : null}
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
