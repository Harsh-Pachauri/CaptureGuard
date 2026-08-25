/**
 * Status-chip treatment for anything sourced from a live Razorpay fetch.
 * The dot fires a single pulse — replayed each time `pulseKey` changes —
 * when the underlying state actually changes. It never pulses continuously;
 * an "always alive" indicator would be dishonest for anything not genuinely
 * live in that instant.
 */
export function LiveBadge({
  label = "LIVE · Razorpay",
  pulseKey,
}: {
  label?: string;
  pulseKey?: string | number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-slate-600 dark:text-slate-400">
      <span className="relative flex h-1.5 w-1.5">
        <span
          key={pulseKey}
          className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 motion-safe:animate-[live-pulse_0.6s_ease-out_1]"
        />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}
