// Compact KPI card with a label and a large headline number, plus an optional trend tag.

import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string;
  trend?: { sign: "up" | "down" | "neutral"; text: string };
  hint?: ReactNode;
}

export default function KpiCard({ label, value, trend, hint }: KpiCardProps) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
          {value}
        </div>
        {trend && (
          <span
            className={
              "rounded px-1.5 py-0.5 text-[11px] font-medium " +
              (trend.sign === "up"
                ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                : trend.sign === "down"
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")
            }
          >
            {trend.text}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}
