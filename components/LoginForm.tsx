"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";

/**
 * Corner-bracket framing around the login card — a secure-terminal
 * viewfinder motif, not a literal shield. Sized to a box modestly larger
 * than the card's own footprint (measured at ~384px x ~300px including
 * the "back" link above the form). Static, non-interactive, and behind
 * the card via -z-10 on a shared relative/-z-10 ancestor.
 */
function SecureFrameBrackets() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
      <div className="relative w-[420px] max-w-[calc(100%-32px)] h-[300px]">
        <span className="absolute top-0 left-0 h-6 w-6 border-t border-l border-slate-500/5 dark:border-slate-400/10" />
        <span className="absolute top-0 right-0 h-6 w-6 border-t border-r border-slate-500/5 dark:border-slate-400/10" />
        <span className="absolute bottom-0 left-0 h-6 w-6 border-b border-l border-slate-500/5 dark:border-slate-400/10" />
        <span className="absolute bottom-0 right-0 h-6 w-6 border-b border-r border-slate-500/5 dark:border-slate-400/10" />
      </div>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Sign-in failed");
        return;
      }
      router.push("/overview");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div aria-hidden className="login-grid pointer-events-none absolute inset-0 -z-10" />
      <SecureFrameBrackets />
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          ← Back to CaptureGuard
        </Link>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm"
        >
          <div className="text-xs font-mono uppercase tracking-widest text-slate-400">
            Access · Merchant Ops Console
          </div>
          <h1 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Logo size={20} /> CaptureGuard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Merchant support operations · Razorpay Test Mode.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mt-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
            autoFocus
          />
          {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-3 w-full rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
