import { amountInBase, sumExpensesInBase } from "@/lib/expenseInBase";
import type { FxRate } from "@/types/fx";

export interface CategoryPeriodRow {
  categoryId: string;
  currentMinor: number;
  previousMinor: number;
  changePct: number | null;
}

export interface PeriodComparisonResult {
  currentTotalMinor: number;
  previousTotalMinor: number;
  spendingChangePct: number | null;
  currentCount: number;
  previousCount: number;
  countChangePct: number | null;
  currentDailyAvgMinor: number;
  previousDailyAvgMinor: number;
  dailyAvgChangePct: number | null;
  byCategory: CategoryPeriodRow[];
}

export interface ExpenseLikeWithCategory {
  amount_minor: number;
  currency_code: string;
  date: string;
  category_id: string;
}

function uniqueDays(dates: string[]): number {
  return new Set(dates.map((d) => d.slice(0, 10))).size;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function comparePeriods(
  current: ExpenseLikeWithCategory[],
  previous: ExpenseLikeWithCategory[],
  baseCurrency: string,
  fxRates: FxRate[],
): PeriodComparisonResult {
  const currentSum = sumExpensesInBase(current, baseCurrency, fxRates);
  const previousSum = sumExpensesInBase(previous, baseCurrency, fxRates);
  const currentTotal = currentSum.totalMinor;
  const previousTotal = previousSum.totalMinor;

  const currentDays = Math.max(uniqueDays(current.map((e) => e.date)), 1);
  const previousDays = Math.max(uniqueDays(previous.map((e) => e.date)), 1);
  const currentDailyAvg = Math.round(currentTotal / currentDays);
  const previousDailyAvg = Math.round(previousTotal / previousDays);

  const catIds = new Set<string>();
  current.forEach((e) => catIds.add(e.category_id));
  previous.forEach((e) => catIds.add(e.category_id));

  const byCategory: CategoryPeriodRow[] = [...catIds].map((categoryId) => {
    const cur = current
      .filter((e) => e.category_id === categoryId)
      .reduce((a, e) => {
        const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
        return ok ? a + amountMinor : e.currency_code === baseCurrency ? a + e.amount_minor : a;
      }, 0);
    const prev = previous
      .filter((e) => e.category_id === categoryId)
      .reduce((a, e) => {
        const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
        return ok ? a + amountMinor : e.currency_code === baseCurrency ? a + e.amount_minor : a;
      }, 0);
    return {
      categoryId,
      currentMinor: cur,
      previousMinor: prev,
      changePct: pctChange(cur, prev),
    };
  });

  byCategory.sort((a, b) => b.currentMinor - a.currentMinor);

  return {
    currentTotalMinor: currentTotal,
    previousTotalMinor: previousTotal,
    spendingChangePct: pctChange(currentTotal, previousTotal),
    currentCount: current.length,
    previousCount: previous.length,
    countChangePct: pctChange(current.length, previous.length),
    currentDailyAvgMinor: currentDailyAvg,
    previousDailyAvgMinor: previousDailyAvg,
    dailyAvgChangePct: pctChange(currentDailyAvg, previousDailyAvg),
    byCategory,
  };
}

export function formatTrendPct(pct: number | null): { sign: "up" | "down" | "neutral"; text: string } {
  if (pct == null || !Number.isFinite(pct)) {
    return { sign: "neutral", text: "—" };
  }
  const rounded = Math.abs(pct).toFixed(1);
  if (Math.abs(pct) < 0.05) return { sign: "neutral", text: "0%" };
  return {
    sign: pct > 0 ? "up" : "down",
    text: `${pct > 0 ? "+" : "-"}${rounded}%`,
  };
}
