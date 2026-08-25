"use client";

import type { ReactNode } from "react";
import { useInViewOnce } from "@/lib/motion-hooks";

export function PipelineStep({
  index,
  total,
  title,
  children,
  emphasize,
}: {
  index: number;
  total: number;
  title: string;
  children: ReactNode;
  emphasize?: boolean;
}) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`flex gap-4 items-start transition-all duration-300 ease-out motion-reduce:transition-none ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
      style={{ transitionDelay: `${(index - 1) * 70}ms` }}
    >
      <div className="flex flex-col items-center shrink-0 w-8">
        <span className="text-xs font-mono text-slate-400 dark:text-slate-600 pt-0.5">0{index}</span>
        {index < total && <span className="mt-2 w-px flex-1 bg-slate-200 dark:bg-slate-800" />}
      </div>
      <div
        className={
          emphasize
            ? "flex-1 mb-8 rounded-xl border-2 border-slate-900/15 dark:border-slate-100/20 bg-slate-50 dark:bg-slate-900/40 p-5"
            : "flex-1 mb-8"
        }
      >
        <div
          className={
            emphasize
              ? "text-base font-semibold text-slate-900 dark:text-slate-100"
              : "text-sm font-medium text-slate-700 dark:text-slate-300"
          }
        >
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}
