// Budgets screen: overall monthly cap and per-category limits with progress.

import { useMemo, useState } from "react";
import PeriodSelector from "@/components/PeriodSelector";
import Button from "@/components/ui/Button";
import { CategoryIcon } from "@/lib/categoryIcons";
import FxMissingBanner from "@/components/FxMissingBanner";
import { amountInBase, sumExpensesInBase } from "@/lib/expenseInBase";
import { activeExpenses } from "@/lib/expenseFilters";
import { formatMinor } from "@/lib/money";
import { useFxRates } from "@/store/fxRates";
import { filterByPeriod, periodRange, type PeriodId } from "@/lib/period";
import { sumCategoryBudgetsMinor, useBudgets } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

function budgetState(pct: number): "ok" | "warning" | "exceeded" {
  if (pct >= 100) return "exceeded";
  if (pct >= 80) return "warning";
  return "ok";
}

function barColor(state: "ok" | "warning" | "exceeded", categoryColor: string): string {
  if (state === "exceeded") return "#ef4444";
  if (state === "warning") return "#d97706";
  return categoryColor;
}

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1 rounded-sm bg-neutral-300 dark:bg-neutral-600"
          style={{ height: `${Math.max(15, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function buildWeeklySparkline(
  expenses: { date: string; amount_minor: number; category_id: string }[],
  categoryId: string,
): number[] {
  const buckets = [0, 0, 0, 0, 0];
  const now = new Date();
  for (const e of expenses) {
    if (e.category_id !== categoryId) continue;
    const d = new Date(e.date);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 0 || diffDays >= 35) continue;
    const week = Math.min(4, Math.floor(diffDays / 7));
    buckets[4 - week] += e.amount_minor;
  }
  return buckets;
}

export default function Budgets() {
  const rawExpenses = useExpenses((s) => s.items);
  const expenses = useMemo(() => activeExpenses(rawExpenses), [rawExpenses]);
  const categories = useCategories((s) => s.items);
  const budgetItems = useBudgets((s) => s.items);
  const totalLimit = useBudgets((s) => s.totalMonthlyMinor);
  const openNewBudget = useUi((s) => s.openNewBudget);
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const fxRates = useFxRates((s) => s.rates);
  const budgetAlerts = useSettings((s) => s.budgetAlerts);

  const [period, setPeriod] = useState<PeriodId>("this_month");
  const periodMonth = useMemo(() => {
    const { start } = periodRange(period);
    return start ? start.format("MMMM") : "";
  }, [period]);

  const monthExpenses = useMemo(
    () => filterByPeriod(expenses, period),
    [expenses, period],
  );

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      if (!ok) continue;
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + amountMinor);
    }
    return map;
  }, [monthExpenses, baseCurrency, fxRates]);

  const monthSum = useMemo(
    () => sumExpensesInBase(monthExpenses, baseCurrency, fxRates),
    [monthExpenses, baseCurrency, fxRates],
  );
  const totalSpent = monthSum.totalMinor;
  const fxSkipped = monthSum.skippedCount;

  const allocatedMinor = useMemo(
    () => sumCategoryBudgetsMinor(budgetItems),
    [budgetItems],
  );
  const unallocatedMinor = Math.max(0, totalLimit - allocatedMinor);

  const totalPct = Math.round((totalSpent / Math.max(totalLimit, 1)) * 100);
  const totalState = budgetState(totalPct);
  const totalRemaining = Math.max(0, totalLimit - totalSpent);

  const unbudgetedCategories = useMemo(() => {
    const budgeted = new Set(budgetItems.map((b) => b.categoryId));
    return categories.filter((c) => c.is_active && !budgeted.has(c.id));
  }, [categories, budgetItems]);

  const alertMessages = useMemo(() => {
    if (!budgetAlerts) return [];
    const msgs: string[] = [];
    if (totalState === "exceeded") {
      msgs.push(`Monthly spending exceeds your ${formatMinor(totalLimit, baseCurrency)} cap.`);
    } else if (totalState === "warning") {
      msgs.push(`Monthly spending is at ${totalPct}% of your cap.`);
    }
    for (const b of budgetItems) {
      const spent = spentByCategory.get(b.categoryId) ?? 0;
      if (spent > b.limitMinor) {
        const cat = categories.find((c) => c.id === b.categoryId);
        msgs.push(
          `${cat?.name ?? "Category"} is over budget by ${formatMinor(spent - b.limitMinor, baseCurrency)}.`,
        );
      }
    }
    return msgs;
  }, [
    budgetAlerts,
    totalState,
    totalPct,
    totalLimit,
    baseCurrency,
    budgetItems,
    spentByCategory,
    categories,
  ]);

  return (
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-8">
      <FxMissingBanner count={fxSkipped} baseCurrency={baseCurrency} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <Button variant="ghost" onClick={() => openNewBudget()}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Budget
        </Button>
      </div>

      {alertMessages.length > 0 && (
        <div className="rounded-card border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="mb-1 font-medium">Budget alerts</p>
          <ul className="list-inside list-disc space-y-0.5 text-amber-900 dark:text-amber-200/90">
            {alertMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-card border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Total monthly budget
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
              {formatMinor(totalLimit, baseCurrency)}{" "}
              <span className="text-lg font-normal text-neutral-500 dark:text-neutral-400">{baseCurrency}</span>
            </p>
          </div>
          {totalState !== "ok" && (
            <span
              className={
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                (totalState === "exceeded"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200")
              }
            >
              {totalState === "exceeded" ? "Over budget" : "High usage"}
            </span>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-300">
          <span>
            {formatMinor(totalSpent, baseCurrency)} spent of {formatMinor(totalLimit, baseCurrency)}
          </span>
          <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-50">{totalPct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(100, totalPct)}%`,
              backgroundColor:
                totalState === "exceeded"
                  ? "#ef4444"
                  : totalState === "warning"
                  ? "#d97706"
                  : "#6366f1",
            }}
          />
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <svg className="mt-0.5 shrink-0" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          {totalState === "exceeded"
            ? `You are over your monthly limit by ${formatMinor(totalSpent - totalLimit, baseCurrency)}.`
            : totalState === "warning"
            ? `You are approaching your limit. ${formatMinor(totalRemaining, baseCurrency)} remaining for ${periodMonth}.`
            : `${formatMinor(totalRemaining, baseCurrency)} remaining for ${periodMonth}.`}
        </p>

        <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <div className="mb-2 flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-300">
            <span>
              Category budgets: {formatMinor(allocatedMinor, baseCurrency)} allocated of {formatMinor(totalLimit, baseCurrency)}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {formatMinor(unallocatedMinor, baseCurrency)} unallocated
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full bg-neutral-400 transition-all"
              style={{
                width: `${Math.min(100, Math.round((allocatedMinor / Math.max(totalLimit, 1)) * 100))}%`,
              }}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {budgetItems.map((b) => {
          const cat = categories.find((c) => c.id === b.categoryId);
          if (!cat) return null;
          const spent = spentByCategory.get(b.categoryId) ?? 0;
          const pct = Math.round((spent / Math.max(b.limitMinor, 1)) * 100);
          const state = budgetState(pct);
          const remaining = b.limitMinor - spent;
          const spark = buildWeeklySparkline(expenses, b.categoryId);

          return (
            <article
              key={b.categoryId}
              className="rounded-card border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: cat.color }}
                >
                  <CategoryIcon name={cat.icon} size={18} />
                </span>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{cat.name}</h3>
              </div>

              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Spent {formatMinor(spent, baseCurrency)} of {formatMinor(b.limitMinor, baseCurrency)}
                </span>
                <span
                  className={
                    "font-medium tabular-nums " +
                    (state === "exceeded" ? "text-rose-500 dark:text-rose-400" : "text-neutral-900 dark:text-neutral-50")
                  }
                >
                  {pct}%
                </span>
              </div>

              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: barColor(state, cat.color),
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>
                  {state === "exceeded"
                    ? `Over by ${formatMinor(Math.abs(remaining), baseCurrency)}`
                    : `${pct}% used · ${formatMinor(Math.max(0, remaining), baseCurrency)} remaining`}
                </span>
                <MiniSparkline values={spark} />
              </div>
            </article>
          );
        })}

        {unbudgetedCategories.slice(0, 1).map((cat) => (
          <article
            key={cat.id}
            className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 bg-neutral-50/50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-900/50"
          >
            <span
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-white opacity-60"
              style={{ backgroundColor: cat.color }}
            >
              <CategoryIcon name={cat.icon} size={20} />
            </span>
            <p
              className="text-sm text-neutral-600 dark:text-neutral-300"
              dangerouslySetInnerHTML={{
                __html: `Set budget for <strong>${cat.name}</strong>`,
              }}
            />
            <button
              type="button"
              onClick={() => openNewBudget(cat.id)}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              + Add
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
