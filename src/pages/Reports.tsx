// Reports screen: insights, charts, and spending analytics.

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Button from "@/components/ui/Button";
import FxMissingBanner from "@/components/FxMissingBanner";
import InsightCards from "@/components/InsightCards";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useInsights } from "@/hooks/useInsights";
import { useFormatLocale } from "@/hooks/useFormatLocale";
import { activeExpenses } from "@/lib/expenseFilters";
import { amountInBase, sumExpensesInBase } from "@/lib/expenseInBase";
import { formatChartDate, formatDate, toDateKey } from "@/lib/date";
import {
  filterByPeriod,
  filterByRange,
  periodPrintLabel,
  previousPeriodRange,
  previousPeriodPrintLabel,
  type PeriodId,
} from "@/lib/period";
import PeriodSelector from "@/components/PeriodSelector";
import { formatMinor } from "@/lib/money";
import { printMonthlyStatement } from "@/lib/printStatement";
import { CategoryIcon } from "@/lib/categoryIcons";
import { useCategories } from "@/store/categories";
import { useExpenses, getCategory } from "@/store/expenses";
import { useFxRates } from "@/store/fxRates";
import type { FxRate } from "@/types/fx";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { comparePeriods, formatTrendPct } from "@/lib/periodComparison";

type TrendRange = "all" | "60" | "30";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function Reports() {
  const { t } = useTranslation("reports");
  const locale = useFormatLocale();
  const rawExpenses = useExpenses((s) => s.items);
  const expenses = useMemo(() => activeExpenses(rawExpenses), [rawExpenses]);
  const categories = useCategories((s) => s.items);
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const fxRates = useFxRates((s) => s.rates);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const openExportCsv = useUi((s) => s.openExportCsv);
  const openEditExpense = useUi((s) => s.openEditExpense);
  const [trendRange, setTrendRange] = useState<TrendRange>("60");
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const isDark = useDarkMode();
  const { insights, loading: insightsLoading } = useInsights(period);

  const thisMonth = useMemo(
    () => filterByPeriod(expenses, period),
    [expenses, period],
  );
  const lastMonth = useMemo(() => {
    const prev = previousPeriodRange(period);
    if (!prev) return [];
    return filterByRange(expenses, prev.start, prev.end);
  }, [expenses, period]);

  const monthSum = useMemo(
    () => sumExpensesInBase(thisMonth, baseCurrency, fxRates),
    [thisMonth, baseCurrency, fxRates],
  );
  const monthTotal = monthSum.totalMinor;
  const fxSkipped = monthSum.skippedCount;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of thisMonth) {
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      if (!ok) continue;
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + amountMinor);
    }
    return [...map.entries()]
      .map(([id, total]) => {
        const cat = categories.find((c) => c.id === id);
        return {
          id,
          name: cat?.name ?? "Other",
          color: cat?.color ?? "#737373",
          total,
          pct: Math.round((total / Math.max(monthTotal, 1)) * 100),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [thisMonth, categories, monthTotal, baseCurrency, fxRates]);

  const trendDays = trendRange === "30" ? 30 : trendRange === "60" ? 60 : 90;
  const trendData = useMemo(
    () => buildDailyTrend(expenses, trendDays, baseCurrency, fxRates),
    [expenses, trendDays, baseCurrency, fxRates],
  );

  const dowData = useMemo(() => {
    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const e of thisMonth) {
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      if (!ok) continue;
      const idx = (dayjs(e.date).day() + 6) % 7;
      sums[idx] += amountMinor;
      counts[idx] += 1;
    }
    const avgs = sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0));
    const peakIdx = avgs.indexOf(Math.max(...avgs));
    return DAY_LABELS.map((label, i) => ({
      day: label,
      amount: avgs[i],
      isPeak: i === peakIdx && avgs[i] > 0,
    }));
  }, [thisMonth, baseCurrency, fxRates]);

  const topTransactions = useMemo(
    () =>
      [...thisMonth]
        .map((e) => {
          const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
          return { e, baseMinor: ok ? amountMinor : -1 };
        })
        .filter((x) => x.baseMinor >= 0)
        .sort((a, b) => b.baseMinor - a.baseMinor)
        .slice(0, 3)
        .map((x) => x.e),
    [thisMonth, baseCurrency, fxRates],
  );

  const comparison = useMemo(() => {
    const prev = previousPeriodRange(period);
    if (!prev) return null;
    return comparePeriods(thisMonth, lastMonth, baseCurrency, fxRates);
  }, [period, thisMonth, lastMonth, baseCurrency, fxRates]);

  const donutData = byCategory.slice(0, 4);
  const donutOther =
    monthTotal - donutData.reduce((a, d) => a + d.total, 0);
  const pieSlices = [
    ...donutData,
    ...(donutOther > 0
      ? [{ id: "other", name: "Other", color: "#a3a3a3", total: donutOther, pct: 0 }]
      : []),
  ];

  const chartAxisTick = isDark ? "#a1a1aa" : "#737373";
  const chartBarMuted = isDark ? "#3f3f46" : "#e5e5e5";
  const trendGradientId = isDark ? "trendFillDark" : "trendFill";

  return (
    <div className="space-y-6 p-8">
      <FxMissingBanner count={fxSkipped} baseCurrency={baseCurrency} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={openExportCsv}>{t("export")}</Button>
        </div>
      </div>

      <InsightCards insights={insights} loading={insightsLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{t("spendingByCategory")}</h2>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieSlices}
                    dataKey="total"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieSlices.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none -mt-[7.5rem] flex h-0 justify-center">
                <div className="text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Total
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                    {formatMinor(monthTotal, baseCurrency)}
                  </p>
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-3">
              {pieSlices.map((row) => (
                <li key={row.id} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-neutral-700 dark:text-neutral-200">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.name}
                  </span>
                  <span className="tabular-nums text-neutral-900 dark:text-neutral-50">
                    {formatMinor(row.total, baseCurrency)}{" "}
                    <span className="text-neutral-400 dark:text-neutral-500">
                      ({Math.round((row.total / Math.max(monthTotal, 1)) * 100)}%)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {comparison && (
          <section className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {t("comparedTo", { period: previousPeriodPrintLabel(period) ?? t("previousPeriod") })}
            </h2>
            <div className="space-y-6">
              <CompareBar
                label={t("spending")}
                change={comparison.spendingChangePct ?? 0}
                positiveIsBad
              />
              <CompareBar
                label={t("avgDailySpend")}
                change={comparison.dailyAvgChangePct ?? 0}
                positiveIsBad
              />
              <CompareBar
                label={t("transactionCount")}
                change={comparison.countChangePct ?? 0}
                positiveIsBad
              />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              {(comparison.spendingChangePct ?? 0) > 0 ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("spendingUp", {
                      pct: Math.abs(comparison.spendingChangePct ?? 0).toFixed(1),
                      period: previousPeriodPrintLabel(period) ?? t("previousPeriod"),
                    }),
                  }}
                />
              ) : (
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("spendingDown", {
                      pct: Math.abs(comparison.spendingChangePct ?? 0).toFixed(1),
                      period: previousPeriodPrintLabel(period) ?? t("previousPeriod"),
                    }),
                  }}
                />
              )}
            </p>
          </section>
        )}
      </div>

      <section className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{t("dailyTrend")}</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("trailingDays", { days: trendDays })}</p>
          </div>
          <div className="flex rounded-control border border-neutral-200 bg-neutral-50 p-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-950">
            {(["all", "60", "30"] as TrendRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTrendRange(r)}
                className={
                  "rounded px-3 py-1 font-medium uppercase tracking-wider transition-colors " +
                  (trendRange === r
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100")
                }
              >
                {r === "all" ? "All" : `${r}D`}
              </button>
            ))}
          </div>
        </header>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="trendFillDark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: chartAxisTick }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(trendDays / 7) - 1)}
                tickFormatter={(value) => formatChartDate(String(value))}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: isDark ? "#262626" : "#171717",
                  border: "1px solid " + (isDark ? "#404040" : "transparent"),
                  borderRadius: 6,
                  color: "#fafafa",
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatMinor(v, baseCurrency), "Spent"]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { date?: string; label?: string } | undefined;
                  if (!row?.date) return "";
                  if (row.label === "Today") return "Today";
                  return formatDate(row.date, "MMM D, YYYY");
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={isDark ? "#818cf8" : "#6366f1"}
                strokeWidth={2}
                fill={`url(#${trendGradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <header className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{t("topTransactions")}</h2>
            <button
              type="button"
              onClick={() => setCurrentPage("expenses")}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("viewAll")}
            </button>
          </header>
          <ul>
            {topTransactions.map((e) => {
              const cat = getCategory(e.category_id);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-4 border-t border-neutral-100 px-6 py-4 first:border-t-0 dark:border-neutral-800"
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {cat ? <CategoryIcon name={cat.icon} size={18} /> : "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                      {e.note ?? t("expenseFallback")}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {cat?.name} · {formatDate(e.date, "MMM D")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Edit expense"
                      onClick={() => openEditExpense(e.id)}
                      className="rounded-control p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-accent dark:hover:bg-neutral-800 dark:hover:text-accent"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                    <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-50">
                      −{formatMinor(e.amount_minor, e.currency_code)}
                    </span>
                  </div>
                </li>
              );
            })}
            {topTransactions.length === 0 && (
              <li className="px-6 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {t("noTransactions")}
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{t("dowPattern")}</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: chartAxisTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {dowData.map((entry) => (
                    <Cell
                      key={entry.day}
                      fill={entry.isPeak ? (isDark ? "#818cf8" : "#6366f1") : chartBarMuted}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> {t("peakDay")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-neutral-300 dark:bg-neutral-600" /> {t("dailyAverage")}
            </span>
          </div>
        </section>
      </div>

      {comparison && (
        <section className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{t("categoryComparison")}</h2>
          <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">{t("categoryComparisonHint")}</p>
          <div className="overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-2 text-left">{t("colCategory")}</th>
                  <th className="py-2 text-right">{t("colThisPeriod")}</th>
                  <th className="py-2 text-right">{t("colPrevious")}</th>
                  <th className="py-2 text-right">{t("colChange")}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.byCategory.slice(0, 8).map((row) => {
                  const cat = categories.find((c) => c.id === row.categoryId);
                  const change = row.changePct;
                  const highlight = change != null && Math.abs(change) >= 15;
                  return (
                    <tr
                      key={row.categoryId}
                      className={
                        "border-t border-neutral-100 dark:border-neutral-800 " +
                        (highlight ? "bg-amber-50/60 dark:bg-amber-500/10" : "")
                      }
                    >
                      <td className="py-2 text-neutral-700 dark:text-neutral-200">
                        {cat?.name ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-neutral-900 dark:text-neutral-50">
                        {formatMinor(row.currentMinor, baseCurrency, locale)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                        {formatMinor(row.previousMinor, baseCurrency, locale)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <span
                          className={
                            (change ?? 0) >= 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }
                        >
                          {formatTrendPct(change).text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-6 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
        <span>© {new Date().getFullYear()} Expense Tracker · {t("dataStoredLocally")}</span>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={openExportCsv}
            className="hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {t("downloadCsv")}
          </button>
          <button
            type="button"
            onClick={() =>
              printMonthlyStatement(thisMonth, {
                baseCurrency,
                periodLabel: periodPrintLabel(period),
              })
            }
            className="hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {t("printStatement")}
          </button>
        </div>
      </footer>
    </div>
  );
}

function CompareBar({
  label,
  change,
  positiveIsBad,
}: {
  label: string;
  change: number;
  positiveIsBad: boolean;
}) {
  const isUp = change >= 0;
  const tone =
    (isUp && positiveIsBad) || (!isUp && !positiveIsBad)
      ? "text-rose-600 dark:text-rose-400"
      : "text-emerald-600 dark:text-emerald-400";
  const width = Math.min(100, Math.abs(change) * 4 + 40);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span>{label}</span>
        <span className={tone}>
          {isUp ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div className="absolute inset-y-0 left-0 w-3/5 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function buildDailyTrend(
  items: { date: string; amount_minor: number; currency_code: string }[],
  days: number,
  baseCurrency: string,
  fxRates: FxRate[],
): { date: string; label: string; total: number }[] {
  const buckets: { date: string; label: string; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, "day").startOf("day");
    const dateKey = d.format("YYYY-MM-DD");
    buckets.push({
      date: dateKey,
      label: formatChartDate(dateKey),
      total: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const item of items) {
    const i = index.get(toDateKey(item.date));
    if (i === undefined) continue;
    const { amountMinor, ok } = amountInBase(item, baseCurrency, fxRates);
    if (ok) buckets[i].total += amountMinor;
  }
  if (buckets.length > 0) {
    buckets[buckets.length - 1].label = "Today";
  }
  return buckets;
}
