// Dashboard screen: KPI cards, daily trend, category breakdown, recent transactions, budgets.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "@/components/KpiCard";
import ExpenseRow from "@/components/ExpenseRow";
import ExpenseListItem from "@/components/ExpenseListItem";
import { useDarkMode } from "@/hooks/useDarkMode";
import { formatChartDate, formatDate, isThisWeek, toDateKey } from "@/lib/date";
import FxMissingBanner from "@/components/FxMissingBanner";
import { amountInBase, countMissingFx, sumExpensesInBase } from "@/lib/expenseInBase";
import { formatMinor } from "@/lib/money";
import { useFxRates } from "@/store/fxRates";
import type { FxRate } from "@/types/fx";
import dayjs from "dayjs";
import { activeExpenses } from "@/lib/expenseFilters";
import {
  filterByPeriod,
  periodRange,
  periodSpentLabel,
  type PeriodId,
} from "@/lib/period";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useUi } from "@/store/ui";
import { useBudgets } from "@/store/budgets";
import { useSettings } from "@/store/settings";
import { comparePeriods, formatTrendPct } from "@/lib/periodComparison";
import { filterByRange, previousPeriodRange } from "@/lib/period";

export default function Dashboard() {
  const rawItems = useExpenses((s) => s.items);
  const items = useMemo(() => activeExpenses(rawItems), [rawItems]);
  const categories = useCategories((s) => s.items);
  const budgetItems = useBudgets((s) => s.items);
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const weekStartDay = useSettings((s) => s.weekStartDay);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const period = useUi((s) => s.dashboardPeriod);
  const spentLabel = periodSpentLabel(period);
  const isDark = useDarkMode();
  const fxRates = useFxRates((s) => s.rates);
  const todayLabel = "Today";

  const stats = useMemo(() => {
    const monthExpenses = filterByPeriod(items, period);
    const weekExpenses = items.filter((e) => isThisWeek(e.date, weekStartDay));

    const monthSum = sumExpensesInBase(monthExpenses, baseCurrency, fxRates);
    const weekSum = sumExpensesInBase(weekExpenses, baseCurrency, fxRates);
    const monthTotal = monthSum.totalMinor;
    const weekTotal = weekSum.totalMinor;
    const fxSkipped = countMissingFx(monthExpenses, baseCurrency, fxRates);
    const dailyAvg = monthSum.convertedCount
      ? Math.round(monthTotal / Math.max(uniqueDays(monthExpenses.map((e) => e.date)), 1))
      : 0;

    const byCategory = new Map<string, number>();
    for (const e of monthExpenses) {
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      if (!ok) continue;
      byCategory.set(e.category_id, (byCategory.get(e.category_id) ?? 0) + amountMinor);
    }
    const breakdown = [...byCategory.entries()]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total);

    const topCategoryId = breakdown[0]?.id;
    const topCategory = categories.find((c) => c.id === topCategoryId);
    const topCategoryPct = topCategoryId
      ? Math.round((breakdown[0].total / Math.max(monthTotal, 1)) * 100)
      : 0;

    return {
      monthExpenses,
      monthTotal,
      weekTotal,
      dailyAvg,
      breakdown,
      topCategory,
      topCategoryPct,
      fxSkipped,
    };
  }, [items, categories, weekStartDay, period, baseCurrency, fxRates]);

  const prevComparison = useMemo(() => {
    const prev = previousPeriodRange(period);
    if (!prev) return null;
    const prevExpenses = filterByRange(items, prev.start, prev.end);
    return comparePeriods(stats.monthExpenses, prevExpenses, baseCurrency, fxRates);
  }, [items, period, stats.monthExpenses, baseCurrency, fxRates]);

  const trend = useMemo(() => {
    const buckets = buildDailyTrendForPeriod(items, period, baseCurrency, fxRates);
    const todayKey = dayjs().format("YYYY-MM-DD");
    return buckets.map((b) => ({
      ...b,
      label: b.date === todayKey ? todayLabel : formatChartDate(b.date),
    }));
  }, [items, period, baseCurrency, fxRates, todayLabel]);

  return (
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-8">
      <FxMissingBanner count={stats.fxSkipped} baseCurrency={baseCurrency} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={spentLabel}
          value={formatMinor(stats.monthTotal, baseCurrency)}
          trend={prevComparison ? formatTrendPct(prevComparison.spendingChangePct) : undefined}
        />
        <KpiCard
          label="Spent this week"
          value={formatMinor(stats.weekTotal, baseCurrency)}
        />
        <KpiCard
          label="Average per day"
          value={formatMinor(stats.dailyAvg, baseCurrency)}
          trend={prevComparison ? formatTrendPct(prevComparison.dailyAvgChangePct) : undefined}
        />
        <KpiCard
          label="Top category"
          value={stats.topCategory?.name ?? "—"}
          hint={
            stats.topCategory ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: stats.topCategory.color }}
                />
                {stats.topCategoryPct}% of total spend
              </span>
            ) : null
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="col-span-1 rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-3">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Daily spending trend
            </h2>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {trendChartCaption(period, "Last 30 days")}
            </div>
          </header>
          <TrendChart
            data={trend}
            baseCurrency={baseCurrency}
            isDark={isDark}
            emptyLabel="No spending in this period."
            spentLabel="Spent"
            todayLabel={todayLabel}
          />
        </section>

        <section className="col-span-1 rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Spending by category
          </h2>
          <ul className="space-y-4">
            {stats.breakdown.length === 0 && (
              <li className="text-sm text-neutral-500 dark:text-neutral-400">No spending in this period.</li>
            )}
            {stats.breakdown.slice(0, 5).map((row) => {
              const cat = categories.find((c) => c.id === row.id);
              if (!cat) return null;
              const pct = Math.round((row.total / Math.max(stats.monthTotal, 1)) * 100);
              return (
                <li key={row.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </span>
                    <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-50">
                      {formatMinor(row.total, baseCurrency)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="col-span-1 min-w-0 overflow-hidden rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-3">
          <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Recent transactions
            </h2>
            <button
              onClick={() => setCurrentPage("expenses")}
              className="text-xs font-medium text-accent hover:underline"
            >
              View all
            </button>
          </header>
          <ul className="lg:hidden">
            {filterByPeriod(items, period)
              .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
              .slice(0, 5)
              .map((expense) => (
                <ExpenseListItem key={expense.id} expense={expense} baseCurrency={baseCurrency} />
              ))}
          </ul>
          <table className="hidden w-full lg:table">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-2 text-start font-medium">Date</th>
                <th className="px-4 py-2 text-start font-medium">Category</th>
                <th className="px-4 py-2 text-start font-medium">Note</th>
                <th className="px-4 py-2 text-start font-medium">Method</th>
                <th className="px-4 py-2 text-end font-medium">Amount</th>
                <th className="px-2 py-2 text-end font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filterByPeriod(items, period)
                .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
                .slice(0, 5)
                .map((e) => (
                  <ExpenseRow key={e.id} expense={e} />
                ))}
            </tbody>
          </table>
        </section>

        <section className="col-span-1 rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Budget progress
          </h2>
          <ul className="space-y-5">
            {budgetItems.slice(0, 3).map((b) => {
              const cat = categories.find((c) => c.id === b.categoryId);
              if (!cat) return null;
              const spent = stats.monthExpenses
                .filter((e) => e.category_id === b.categoryId)
                .reduce((acc, e) => {
                  const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
                  return ok ? acc + amountMinor : acc;
                }, 0);
              const pct = Math.min(200, Math.round((spent / b.limitMinor) * 100));
              const state =
                pct >= 100 ? "exceeded" : pct >= 80 ? "warning" : "ok";
              const barColor =
                state === "exceeded"
                  ? "#ef4444"
                  : state === "warning"
                  ? "#f59e0b"
                  : "#6366f1";
              return (
                <li key={b.categoryId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-neutral-700 dark:text-neutral-300">{cat.name}</span>
                    <span className="text-xs text-neutral-500 tabular-nums">
                      {formatMinor(spent, baseCurrency)} of {formatMinor(b.limitMinor, baseCurrency)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <div
                    className={
                      "mt-1 text-[11px] " +
                      (state === "exceeded"
                        ? "text-rose-500"
                        : state === "warning"
                        ? "text-amber-500"
                        : "text-neutral-500")
                    }
                  >
                    {state === "exceeded"
                      ? `Over budget by ${formatMinor(spent - b.limitMinor, baseCurrency)}`
                      : state === "warning"
                      ? `${pct}% used — careful`
                      : `${pct}% used`}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function uniqueDays(dates: string[]): number {
  return new Set(dates).size;
}

interface TrendBucketRaw {
  date: string;
  total: number;
}

interface TrendBucket extends TrendBucketRaw {
  label: string;
}

function trendChartCaption(period: PeriodId, fallback: string): string {
  const { start, end } = periodRange(period);
  if (!start || !end) return fallback;
  const days = end.diff(start, "day") + 1;
  if (days <= 31) return start.format("MMMM YYYY");
  return `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
}

function buildDailyTrendForPeriod(
  items: { date: string; amount_minor: number; currency_code: string }[],
  period: PeriodId,
  baseCurrency: string,
  fxRates: FxRate[],
): TrendBucketRaw[] {
  const { start, end } = periodRange(period);
  if (!start || !end)
    return buildDailyTrend(filterByPeriod(items, period), 30, baseCurrency, fxRates);

  const buckets: TrendBucketRaw[] = [];
  let cursor = start;
  while (cursor.isBefore(end, "day") || cursor.isSame(end, "day")) {
    buckets.push({ date: cursor.format("YYYY-MM-DD"), total: 0 });
    cursor = cursor.add(1, "day");
    if (buckets.length >= 62) break;
  }
  const periodItems = filterByPeriod(items, period);
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const item of periodItems) {
    const i = index.get(toDateKey(item.date));
    if (i === undefined) continue;
    const { amountMinor, ok } = amountInBase(item, baseCurrency, fxRates);
    if (ok) buckets[i].total += amountMinor;
  }
  return buckets;
}

function buildDailyTrend(
  items: { date: string; amount_minor: number; currency_code: string }[],
  days: number,
  baseCurrency: string,
  fxRates: FxRate[],
): TrendBucketRaw[] {
  const buckets: TrendBucketRaw[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().slice(0, 10), total: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const item of items) {
    const i = index.get(toDateKey(item.date));
    if (i === undefined) continue;
    const { amountMinor, ok } = amountInBase(item, baseCurrency, fxRates);
    if (ok) buckets[i].total += amountMinor;
  }
  return buckets;
}

function TrendChart({
  data,
  baseCurrency,
  isDark,
  emptyLabel,
  spentLabel,
  todayLabel,
}: {
  data: TrendBucket[];
  baseCurrency: string;
  isDark: boolean;
  emptyLabel: string;
  spentLabel: string;
  todayLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
        {emptyLabel}
      </div>
    );
  }

  const chartAxisTick = isDark ? "#a1a1aa" : "#737373";
  const gradientId = isDark ? "dashboardTrendFillDark" : "dashboardTrendFill";
  const tickInterval = Math.max(0, Math.floor(data.length / 7) - 1);

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dashboardTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="dashboardTrendFillDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: chartAxisTick }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
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
            formatter={(v: number) => [formatMinor(v, baseCurrency), spentLabel]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as TrendBucket | undefined;
              if (!row?.date) return "";
              if (row.label === todayLabel) return todayLabel;
              return formatDate(row.date, "MMM D, YYYY");
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke={isDark ? "#818cf8" : "#6366f1"}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
