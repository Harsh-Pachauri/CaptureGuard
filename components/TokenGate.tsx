"use client";

import { useState } from "react";
import { setStoredToken, useStoredToken } from "@/lib/client/apiClient";

/**
 * Minimal shared-credential login for the dashboard (Section 1 SHOULD-have)
 * — not a full auth system, just a place to paste the INTERNAL_API_TOKEN
 * once so the browser can attach it to every request.
 */
export function TokenGate({ children }: { children: React.ReactNode }) {
  const token = useStoredToken();
  const [input, setInput] = useState("");

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            setStoredToken(input.trim());
          }}
          className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">CaptureGuard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter the internal dashboard token (INTERNAL_API_TOKEN from your .env) to continue.
          </p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Internal API token"
            className="mt-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
            autoFocus
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
