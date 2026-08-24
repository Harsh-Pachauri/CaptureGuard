const VERDICT_STYLES: Record<string, string> = {
  ALLOW: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  BLOCK: "bg-red-50 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  ESCALATE: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
};

export function VerdictBadge({ verdict, ruleId }: { verdict: string; ruleId?: string | null }) {
  const style = VERDICT_STYLES[verdict] ?? "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide ${style}`}>
      {verdict}
      {ruleId ? <span className="opacity-60 font-normal">· {ruleId}</span> : null}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  created: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  authorized: "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  captured: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  failed: "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  refunded: "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  partially_refunded: "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  auto_reversed: "bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  unknown: "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

const DATASOURCE_STYLES: Record<string, string> = {
  real: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  fixture: "bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  eval: "bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
};

export function DataSourceBadge({ dataSource }: { dataSource: string }) {
  const style = DATASOURCE_STYLES[dataSource] ?? DATASOURCE_STYLES.real;
  const label =
    dataSource === "real" ? "Real Razorpay data" : dataSource === "fixture" ? "Seeded fixture" : "Eval-only synthetic";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${style}`} title={label}>
      {dataSource}
    </span>
  );
}
