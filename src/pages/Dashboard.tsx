// Dashboard screen: KPI cards, daily trend, category breakdown, recent transactions, budgets.

import { useMemo } from "react";
import KpiCard from "@/components/KpiCard";
import ExpenseRow from "@/components/ExpenseRow";
import { formatMinor } from "@/lib/money";
import { isThisMonth, isThisWeek } from "@/lib/date";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useUi } from "@/store/ui";
import { useBudgets } from "@/store/budgets";
import { useSettings } from "@/store/settings";

export default function Dashboard() {
  const items = useExpenses((s) => s.items);
  const categories = useCategories((s) => s.items);
  const budgetItems = useBudgets((s) => s.items);
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const weekStartDay = useSettings((s) => s.weekStartDay);
  const setCurrentPage = useUi((s) => s.setCurrentPage);

  const stats = useMemo(() => {
    const monthExpenses = items.filter((e) => isThisMonth(e.date));
    const weekExpenses = items.filter((e) => isThisWeek(e.date, weekStartDay));

    const monthTotal = monthExpenses.reduce((acc, e) => acc + e.amount_minor, 0);
    const weekTotal = weekExpenses.reduce((acc, e) => acc + e.amount_minor, 0);
    const dailyAvg = monthExpenses.length
      ? Math.round(monthTotal / Math.max(uniqueDays(monthExpenses.map((e) => e.date)), 1))
      : 0;

    const byCategory = new Map<string, number>();
    for (const e of monthExpenses) {
      byCategory.set(e.category_id, (byCategory.get(e.category_id) ?? 0) + e.amount_minor);
    }
    const breakdown = [...byCategory.entries()]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total);

    const topCategoryId = breakdown[0]?.id;
    const topCategory = categories.find((c) => c.id === topCategoryId);
    const topCategoryPct = topCategoryId
      ? Math.round((breakdown[0].total / Math.max(monthTotal, 1)) * 100)
      : 0;

    return { monthExpenses, monthTotal, weekTotal, dailyAvg, breakdown, topCategory, topCategoryPct };
  }, [items, categories, weekStartDay]);

  const trend = useMemo(() => buildDailyTrend(items, 30), [items]);
  const maxTrend = Math.max(1, ...trend.map((d) => d.total));

  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Spent this month"
          value={formatMinor(stats.monthTotal, baseCurrency)}
          trend={{ sign: "up", text: "+12%" }}
        />
        <KpiCard
          label="Spent this week"
          value={formatMinor(stats.weekTotal, baseCurrency)}
          hint={`Avg ${formatMinor(stats.dailyAvg, baseCurrency)} / day`}
        />
        <KpiCard
          label="Average per day"
          value={formatMinor(stats.dailyAvg, baseCurrency)}
          trend={{ sign: "down", text: "-5%" }}
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
            <div className="text-xs text-neutral-500">Last 30 days</div>
          </header>
          <TrendChart data={trend} max={maxTrend} />
        </section>

        <section className="col-span-1 rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Spending by category
          </h2>
          <ul className="space-y-4">
            {stats.breakdown.length === 0 && (
              <li className="text-sm text-neutral-500">No spending yet this month.</li>
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
        <section className="col-span-1 rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-3">
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
          <table className="w-full">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Note</th>
                <th className="px-4 py-2 text-left font-medium">Method</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 5).map((e) => (
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
                .reduce((acc, e) => acc + e.amount_minor, 0);
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

interface TrendBucket {
  date: string;
  total: number;
}

function buildDailyTrend(items: { date: string; amount_minor: number }[], days: number): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().slice(0, 10), total: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const item of items) {
    const i = index.get(item.date);
    if (i !== undefined) buckets[i].total += item.amount_minor;
  }
  return buckets;
}

function TrendChart({ data, max }: { data: TrendBucket[]; max: number }) {
  return (
    <div className="flex h-44 items-end gap-1.5">
      {data.map((d, i) => {
        const heightPct = max === 0 ? 0 : (d.total / max) * 100;
        return (
          <div
            key={d.date}
            className="group relative flex-1"
            title={`${d.date}: ${(d.total / 100).toFixed(2)} USD`}
          >
            <div
              className="w-full rounded-sm bg-accent/80 transition-all group-hover:bg-accent"
              style={{ height: `${Math.max(2, heightPct)}%` }}
            />
            {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
              <div className="mt-1 text-center text-[10px] uppercase tracking-wider text-neutral-400">
                {d.date.slice(5)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
