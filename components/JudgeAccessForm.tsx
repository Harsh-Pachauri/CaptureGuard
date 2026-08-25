"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";

/**
 * Structurally parallel to LoginForm.tsx (same fetch/session pattern) but
 * a separate component hitting a separate route (POST
 * /api/auth/judge-login) with a separate credential — never touches
 * LoginForm.tsx or the real admin password.
 */
export function JudgeAccessForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/judge-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Access denied");
        return;
      }
      router.push("/test-lab");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          ← Back to CaptureGuard
        </Link>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm"
        >
          <div className="text-xs font-mono uppercase tracking-widest text-slate-400">Judge Demo · Test Lab</div>
          <h1 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Logo size={20} /> CaptureGuard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A restricted session for running the three real scenarios — no admin access, no production
            configuration, no secrets.
          </p>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Judge access code"
            className="mt-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
            autoFocus
          />
          {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !code}
            className="mt-3 w-full rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Entering…" : "Enter Test Lab"}
          </button>
        </form>
      </div>
    </div>
  );
}
