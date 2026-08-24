"use client";

import { useSyncExternalStore } from "react";

const TOKEN_KEY = "captureguard_token";
const localListeners = new Set<() => void>();

function notifyLocalListeners(): void {
  for (const listener of localListeners) listener();
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  notifyLocalListeners(); // the native "storage" event only fires in OTHER tabs
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  notifyLocalListeners();
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  localListeners.add(callback);
  return () => {
    window.removeEventListener("storage", callback);
    localListeners.delete(callback);
  };
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Subscribes to the stored token via useSyncExternalStore rather than
 * effect + setState — the React-recommended way to read a mutable external
 * store (localStorage) that also needs to update reactively across tabs
 * and after login/logout in the same tab, without the
 * "setState synchronously within an effect" anti-pattern.
 */
export function useStoredToken(): string | null {
  return useSyncExternalStore(subscribe, getStoredToken, getServerSnapshot);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${status}`
    );
    this.status = status;
    this.body = body;
  }
}

/**
 * Thin fetch wrapper for the dashboard: attaches the shared bearer token
 * from localStorage (Section 1's SHOULD-have minimal shared-credential
 * login — not a full auth system, by design) to every /api/* call.
 */
export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...options, headers });
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}
