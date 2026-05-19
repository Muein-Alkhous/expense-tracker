// Reports screen: insights, charts, and spending analytics.

import { useMemo, useState, type ReactNode } from "react";
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
import { formatDate, isThisMonth } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { CategoryIcon } from "@/lib/categoryIcons";
import { useBudgets } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses, getCategory } from "@/store/expenses";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import dayjs from "dayjs";

type TrendRange = "all" | "60" | "30";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function Reports() {
  const expenses = useExpenses((s) => s.items);
  const categories = useCategories((s) => s.items);
  const budgetItems = useBudgets((s) => s.items);
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const openExportCsv = useUi((s) => s.openExportCsv);
  const [trendRange, setTrendRange] = useState<TrendRange>("60");

  const thisMonth = useMemo(() => expenses.filter((e) => isThisMonth(e.date)), [expenses]);
  const lastMonth = useMemo(() => {
    const start = dayjs().subtract(1, "month").startOf("month");
    const end = dayjs().subtract(1, "month").endOf("month");
    return expenses.filter((e) => {
      const d = dayjs(e.date);
      return (d.isAfter(start) || d.isSame(start, "day")) && (d.isBefore(end) || d.isSame(end, "day"));
    });
  }, [expenses]);

  const monthTotal = useMemo(
    () => thisMonth.reduce((acc, e) => acc + e.amount_minor, 0),
    [thisMonth],
  );
  const lastMonthTotal = useMemo(
    () => lastMonth.reduce((acc, e) => acc + e.amount_minor, 0),
    [lastMonth],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of thisMonth) {
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + e.amount_minor);
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
  }, [thisMonth, categories, monthTotal]);

  const insights = useMemo(() => {
    const cards: { tag?: string; tagTone?: "insight" | "alert"; text: ReactNode }[] = [];

    const foodThis = thisMonth.filter((e) => e.category_id === "food").reduce((a, e) => a + e.amount_minor, 0);
    const foodLast = lastMonth.filter((e) => e.category_id === "food").reduce((a, e) => a + e.amount_minor, 0);
    if (foodLast > 0) {
      const change = Math.round(((foodThis - foodLast) / foodLast) * 100);
      if (change !== 0) {
        cards.push({
          tag: "INSIGHT",
          tagTone: "insight",
          text: (
            <>
              Food spending {change > 0 ? "up" : "down"}{" "}
              <strong>{Math.abs(change)}%</strong> vs last month
            </>
          ),
        });
      }
    }

    const byDay = new Map<number, number[]>();
    for (const e of thisMonth) {
      const dow = dayjs(e.date).day();
      const list = byDay.get(dow) ?? [];
      list.push(e.amount_minor);
      byDay.set(dow, list);
    }
    let peakDay = 0;
    let peakAvg = 0;
    for (const [dow, amounts] of byDay) {
      const avg = amounts.reduce((a, n) => a + n, 0) / amounts.length;
      if (avg > peakAvg) {
        peakAvg = avg;
        peakDay = dow;
      }
    }
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (peakAvg > 0) {
      cards.push({
        text: (
          <>
            {dayNames[peakDay]} is your highest spending day — avg{" "}
            <strong>{formatMinor(Math.round(peakAvg), baseCurrency)}</strong>
          </>
        ),
      });
    }

    for (const b of budgetItems) {
      const spent = thisMonth
        .filter((e) => e.category_id === b.categoryId)
        .reduce((a, e) => a + e.amount_minor, 0);
      if (spent > b.limitMinor) {
        const cat = categories.find((c) => c.id === b.categoryId);
        cards.push({
          tag: "ALERT",
          tagTone: "alert",
          text: (
            <>
              You exceeded your <strong>{cat?.name ?? "category"}</strong> budget by{" "}
              <strong>{formatMinor(spent - b.limitMinor, baseCurrency)}</strong>
            </>
          ),
        });
        break;
      }
    }

    if (byCategory.length >= 2) {
      const topTwoPct = byCategory[0].pct + byCategory[1].pct;
      cards.push({
        text: (
          <>
            Two categories make up <strong>{topTwoPct}%</strong> of spend
          </>
        ),
      });
    }

    return cards.slice(0, 4);
  }, [thisMonth, lastMonth, budgetItems, categories, byCategory, baseCurrency]);

  const trendDays = trendRange === "30" ? 30 : trendRange === "60" ? 60 : 90;
  const trendData = useMemo(() => buildDailyTrend(expenses, trendDays), [expenses, trendDays]);

  const dowData = useMemo(() => {
    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const e of thisMonth) {
      const idx = (dayjs(e.date).day() + 6) % 7;
      sums[idx] += e.amount_minor;
      counts[idx] += 1;
    }
    const avgs = sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0));
    const peakIdx = avgs.indexOf(Math.max(...avgs));
    return DAY_LABELS.map((label, i) => ({
      day: label,
      amount: avgs[i],
      isPeak: i === peakIdx && avgs[i] > 0,
    }));
  }, [thisMonth]);

  const topTransactions = useMemo(
    () => [...thisMonth].sort((a, b) => b.amount_minor - a.amount_minor).slice(0, 3),
    [thisMonth],
  );

  const spendingChange =
    lastMonthTotal > 0
      ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100
      : 0;
  const savingsChange = -spendingChange * 0.2;

  const donutData = byCategory.slice(0, 4);
  const donutOther =
    monthTotal - donutData.reduce((a, d) => a + d.total, 0);
  const pieSlices = [
    ...donutData,
    ...(donutOther > 0
      ? [{ id: "other", name: "Other", color: "#a3a3a3", total: donutOther, pct: 0 }]
      : []),
  ];

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          This month
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={openExportCsv}>Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((card, i) => (
          <InsightCard key={i} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Spending by category</h2>
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
                  <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Total</p>
                  <p className="text-lg font-semibold tabular-nums">{formatMinor(monthTotal, baseCurrency)}</p>
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-3">
              {pieSlices.map((row) => (
                <li key={row.id} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-neutral-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.name}
                  </span>
                  <span className="tabular-nums text-neutral-900">
                    {formatMinor(row.total, baseCurrency)}{" "}
                    <span className="text-neutral-400">
                      ({Math.round((row.total / Math.max(monthTotal, 1)) * 100)}%)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-card border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Compared to last month</h2>
          <div className="space-y-6">
            <CompareBar
              label="SPENDING"
              change={spendingChange}
              positiveIsBad
            />
            <CompareBar label="SAVINGS" change={savingsChange} positiveIsBad={false} />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-neutral-500">
            {spendingChange > 0 ? (
              <>
                Spending is up <strong className="text-neutral-800">{spendingChange.toFixed(1)}%</strong>{" "}
                compared to last month. Review your top categories to stay on track.
              </>
            ) : (
              <>
                You spent <strong className="text-neutral-800">{Math.abs(spendingChange).toFixed(1)}% less</strong>{" "}
                than last month — nice work keeping costs down.
              </>
            )}
          </p>
        </section>
      </div>

      <section className="rounded-card border border-neutral-200 bg-white p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Daily spending trend</h2>
            <p className="text-xs text-neutral-500">Trailing {trendDays} days activity</p>
          </div>
          <div className="flex rounded-control border border-neutral-200 p-0.5 text-xs">
            {(["all", "60", "30"] as TrendRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTrendRange(r)}
                className={
                  "rounded px-3 py-1 font-medium uppercase tracking-wider transition-colors " +
                  (trendRange === r
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:text-neutral-900")
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
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "#171717",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatMinor(v, baseCurrency), "Spent"]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#trendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-neutral-200 bg-white">
          <header className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-neutral-900">Top transactions</h2>
            <button
              type="button"
              onClick={() => setCurrentPage("expenses")}
              className="text-xs font-medium text-accent hover:underline"
            >
              View all
            </button>
          </header>
          <ul>
            {topTransactions.map((e) => {
              const cat = getCategory(e.category_id);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-4 border-t border-neutral-100 px-6 py-4 first:border-t-0"
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
                  >
                    {cat ? <CategoryIcon name={cat.icon} size={18} /> : "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">
                      {e.note ?? "Expense"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {cat?.name} · {formatDate(e.date, "MMM D")}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-neutral-900">
                    −{formatMinor(e.amount_minor, e.currency_code)}
                  </span>
                </li>
              );
            })}
            {topTransactions.length === 0 && (
              <li className="px-6 py-8 text-center text-sm text-neutral-500">No transactions this month.</li>
            )}
          </ul>
        </section>

        <section className="rounded-card border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Day-of-week pattern</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "#a3a3a3" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {dowData.map((entry) => (
                    <Cell key={entry.day} fill={entry.isPeak ? "#6366f1" : "#e5e5e5"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Peak day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-neutral-200" /> Daily average
            </span>
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-6 text-xs text-neutral-400">
        <span>© {new Date().getFullYear()} Expense Tracker · Data stored locally</span>
        <div className="flex gap-4">
          <button type="button" onClick={openExportCsv} className="hover:text-neutral-600">
            Download CSV
          </button>
          <button type="button" className="hover:text-neutral-600">Print statement</button>
        </div>
      </footer>
    </div>
  );
}

function InsightCard({
  tag,
  tagTone = "insight",
  text,
}: {
  tag?: string;
  tagTone?: "insight" | "alert";
  text: ReactNode;
}) {
  return (
    <article className="rounded-card border border-neutral-200 bg-white p-4 shadow-sm">
      {tag && (
        <span
          className={
            "mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
            (tagTone === "alert"
              ? "bg-rose-50 text-rose-600"
              : "bg-amber-50 text-amber-700")
          }
        >
          {tag}
        </span>
      )}
      <p className="text-sm leading-relaxed text-neutral-700">{text}</p>
    </article>
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
      ? "text-rose-600"
      : "text-emerald-600";
  const width = Math.min(100, Math.abs(change) * 4 + 40);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-neutral-500">
        <span>{label}</span>
        <span className={tone}>
          {isUp ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className="absolute inset-y-0 left-0 w-3/5 rounded-full bg-neutral-200" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function buildDailyTrend(
  items: { date: string; amount_minor: number }[],
  days: number,
): { label: string; total: number }[] {
  const buckets: { date: string; total: number; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, "day");
    buckets.push({
      date: d.format("YYYY-MM-DD"),
      total: 0,
      label: d.format(days <= 30 ? "MMM D" : i % 14 === 0 ? "MMM D" : ""),
    });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const item of items) {
    const i = index.get(item.date);
    if (i !== undefined) buckets[i].total += item.amount_minor;
  }
  if (buckets.length > 0) {
    buckets[buckets.length - 1].label = "Today";
  }
  return buckets;
}
