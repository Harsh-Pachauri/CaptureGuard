"use client";

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
 * Thin fetch wrapper for the dashboard. The browser authenticates via the
 * HttpOnly session cookie (sent automatically on same-origin requests) —
 * it never holds or attaches INTERNAL_API_TOKEN. A 401 means the session
 * expired or was never established; send the user back to sign in.
 */
export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}
