import { useTranslation } from "react-i18next";
import { useFormatLocale } from "@/hooks/useFormatLocale";
import { formatMinor } from "@/lib/money";
import type { Insight } from "@/types/insight";

interface InsightCardsProps {
  insights: Insight[];
  loading?: boolean;
}

export default function InsightCards({ insights, loading }: InsightCardsProps) {
  const { t } = useTranslation("reports");
  const locale = useFormatLocale();

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
        <InsightCard key={card.id} insight={card} t={t} locale={locale} />
      ))}
    </div>
  );
}

function InsightCard({
  insight,
  t,
  locale,
}: {
  insight: Insight;
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
}) {
  const params = { ...insight.params };
  if (typeof params.amountMinor === "number" && typeof params.currency === "string") {
    params.amountFormatted = formatMinor(params.amountMinor, params.currency, locale);
  }
  if (typeof params.overMinor === "number" && typeof params.currency === "string") {
    params.overFormatted = formatMinor(params.overMinor, params.currency, locale);
  }

  const text = t(insight.messageKey, params);
  const tag = insight.kind === "alert" ? t("insight.tagAlert") : t("insight.tagInsight");
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
