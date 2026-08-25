/**
 * Formats a real ISO timestamp as "Xs/Xm/Xh/Xd ago" relative to `now`
 * (defaults to the moment it's called). Computed once per render, on
 * demand — never a ticking clock, so it only updates when the component
 * naturally re-renders (e.g. after a refresh()), not continuously.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 5000) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
