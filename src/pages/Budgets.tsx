// Budgets screen: overall monthly cap and per-category limits with progress.

import { useMemo } from "react";
import Button from "@/components/ui/Button";
import { CategoryIcon } from "@/lib/categoryIcons";
import { formatMinor } from "@/lib/money";
import { isThisMonth } from "@/lib/date";
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
          className="w-1 rounded-sm bg-neutral-300"
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
  const expenses = useExpenses((s) => s.items);
  const categories = useCategories((s) => s.items);
  const budgetItems = useBudgets((s) => s.items);
  const totalLimit = useBudgets((s) => s.totalMonthlyMinor);
  const openNewBudget = useUi((s) => s.openNewBudget);
  const baseCurrency = useSettings((s) => s.baseCurrency);

  const monthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const monthExpenses = useMemo(
    () => expenses.filter((e) => isThisMonth(e.date)),
    [expenses],
  );

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + e.amount_minor);
    }
    return map;
  }, [monthExpenses]);

  const totalSpent = useMemo(
    () => monthExpenses.reduce((acc, e) => acc + e.amount_minor, 0),
    [monthExpenses],
  );

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
          {monthLabel}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <Button variant="ghost" onClick={() => openNewBudget()}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Budget
        </Button>
      </div>

      <section className="rounded-card border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Total monthly budget
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900">
              {formatMinor(totalLimit, baseCurrency)}{" "}
              <span className="text-lg font-normal text-neutral-500">{baseCurrency}</span>
            </p>
          </div>
          {totalState !== "ok" && (
            <span
              className={
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                (totalState === "exceeded"
                  ? "bg-rose-50 text-rose-600"
                  : "bg-amber-50 text-amber-700")
              }
            >
              {totalState === "exceeded" ? "Over budget" : "High usage"}
            </span>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between text-sm text-neutral-600">
          <span>
            {formatMinor(totalSpent, baseCurrency)} spent of{" "}
            {formatMinor(totalLimit, baseCurrency)}
          </span>
          <span className="font-medium tabular-nums text-neutral-900">{totalPct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
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
        <p className="mt-4 flex items-start gap-2 text-sm text-neutral-500">
          <svg className="mt-0.5 shrink-0" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          {totalState === "exceeded"
            ? `You are over your monthly limit by ${formatMinor(totalSpent - totalLimit, baseCurrency)}.`
            : totalState === "warning"
            ? `You are approaching your limit. ${formatMinor(totalRemaining, baseCurrency)} remaining for ${monthLabel.split(" ")[0]}.`
            : `${formatMinor(totalRemaining, baseCurrency)} remaining for ${monthLabel.split(" ")[0]}.`}
        </p>

        <div className="mt-5 border-t border-neutral-100 pt-4">
          <div className="mb-2 flex items-center justify-between text-sm text-neutral-600">
            <span>
              Category budgets: {formatMinor(allocatedMinor, baseCurrency)} allocated of{" "}
              {formatMinor(totalLimit, baseCurrency)}
            </span>
            <span className="text-xs text-neutral-500">
              {formatMinor(unallocatedMinor, baseCurrency)} unallocated
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
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
              className="rounded-card border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: cat.color }}
                >
                  <CategoryIcon name={cat.icon} size={18} />
                </span>
                <h3 className="font-semibold text-neutral-900">{cat.name}</h3>
              </div>

              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-neutral-600">
                  Spent {formatMinor(spent, baseCurrency)} of{" "}
                  {formatMinor(b.limitMinor, baseCurrency)}
                </span>
                <span
                  className={
                    "font-medium tabular-nums " +
                    (state === "exceeded" ? "text-rose-600" : "text-neutral-900")
                  }
                >
                  {pct}%
                </span>
              </div>

              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: barColor(state, cat.color),
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
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
            className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 bg-neutral-50/50 p-8 text-center"
          >
            <span
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-white opacity-60"
              style={{ backgroundColor: cat.color }}
            >
              <CategoryIcon name={cat.icon} size={20} />
            </span>
            <p className="text-sm text-neutral-600">
              Set budget for <strong className="text-neutral-900">{cat.name}</strong>
            </p>
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
