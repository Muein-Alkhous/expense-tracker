import { formatMinor } from "@/lib/money";
import type { Insight } from "@/types/insight";

interface InsightCardsProps {
  insights: Insight[];
  loading?: boolean;
}

const INSIGHT_TAG: Record<string, string> = {
  alert: "ALERT",
  insight: "INSIGHT",
};

function formatInsightMessage(key: string, params: Record<string, unknown>): string {
  switch (key) {
    case "insight.category_mom_up":
      return `${params.category} spending up ${params.percent}% vs previous period`;
    case "insight.category_mom_down":
      return `${params.category} spending down ${params.percent}% vs previous period`;
    case "insight.peak_weekday":
      return `${params.weekday} is your highest spending day — avg ${params.amountFormatted}`;
    case "insight.budget_warning":
      return `${params.category} budget at ${params.percent}% of limit`;
    case "insight.budget_exceeded":
      return `Exceeded ${params.category} budget by ${params.overFormatted}`;
    case "insight.category_concentration":
      return `Two categories make up ${params.percent}% of spend`;
    case "insight.unusual_transaction":
      return `Unusually large ${params.category} expense: ${params.amountFormatted}`;
    default:
      return key;
  }
}

export default function InsightCards({ insights, loading }: InsightCardsProps) {
  if (loading && insights.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-card border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
          />
        ))}
      </div>
    );
  }

  if (insights.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {insights.map((card) => (
        <InsightCard key={card.id} insight={card} />
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const params = { ...insight.params };
  if (typeof params.amountMinor === "number" && typeof params.currency === "string") {
    params.amountFormatted = formatMinor(params.amountMinor, params.currency);
  }
  if (typeof params.overMinor === "number" && typeof params.currency === "string") {
    params.overFormatted = formatMinor(params.overMinor, params.currency);
  }

  const text = formatInsightMessage(insight.messageKey, params);
  const tag = INSIGHT_TAG[insight.kind] ?? "";
  const tagTone = insight.kind === "alert" ? "alert" : "insight";

  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {tag && (
        <span
          className={
            "mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
            (tagTone === "alert"
              ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
              : "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300")
          }
        >
          {tag}
        </span>
      )}
      <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">{text}</p>
    </div>
  );
}
