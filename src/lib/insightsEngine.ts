// Rule-based insights for browser mode (mirrors src-tauri/src/insights.rs).

import dayjs from "dayjs";
import { amountInBase } from "@/lib/expenseInBase";
import type { CategoryBudget } from "@/store/budgets";
import type { Insight, InsightKind } from "@/types/insight";
import type { Category, Expense } from "@/types";
import type { FxRate } from "@/types/fx";

function dateKey(date: string): string {
  return date.slice(0, 10);
}

function inRange(date: string, start: string, end: string): boolean {
  const d = dateKey(date);
  return d >= start && d <= end;
}

function sumCategory(
  expenses: Expense[],
  categoryId: string,
  baseCurrency: string,
  fxRates: FxRate[],
): number {
  return expenses
    .filter((e) => e.category_id === categoryId)
    .reduce((acc, e) => {
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      if (ok) return acc + amountMinor;
      if (e.currency_code === baseCurrency) return acc + e.amount_minor;
      return acc;
    }, 0);
}

function sumAll(expenses: Expense[], baseCurrency: string, fxRates: FxRate[]): number {
  return expenses.reduce((acc, e) => {
    const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
    if (ok) return acc + amountMinor;
    if (e.currency_code === baseCurrency) return acc + e.amount_minor;
    return acc;
  }, 0);
}

function categoryName(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.name ?? "Category";
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function makeInsight(
  kind: InsightKind,
  rule: string,
  messageKey: string,
  params: Record<string, string | number>,
): Insight {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    rule,
    messageKey,
    params,
  };
}

export interface ComputeInsightsInput {
  expenses: Expense[];
  categories: Category[];
  budgetItems: CategoryBudget[];
  fxRates: FxRate[];
  baseCurrency: string;
  periodStart: string;
  periodEnd: string;
  prevStart?: string;
  prevEnd?: string;
}

export function computeInsights(input: ComputeInsightsInput): Insight[] {
  const {
    expenses: allExpenses,
    categories,
    budgetItems,
    fxRates,
    baseCurrency,
    periodStart,
    periodEnd,
    prevStart,
    prevEnd,
  } = input;

  const active = allExpenses.filter((e) => !e.deleted_at);
  const current = active.filter((e) => inRange(e.date, periodStart, periodEnd));
  const previous =
    prevStart && prevEnd
      ? active.filter((e) => inRange(e.date, prevStart, prevEnd))
      : [];

  const out: Insight[] = [];

  if (previous.length > 0) {
    const catIds = new Set<string>();
    current.forEach((e) => catIds.add(e.category_id));
    previous.forEach((e) => catIds.add(e.category_id));
    for (const catId of catIds) {
      const thisSum = sumCategory(current, catId, baseCurrency, fxRates);
      const prevSum = sumCategory(previous, catId, baseCurrency, fxRates);
      if (prevSum === 0 || thisSum === 0) continue;
      const change = Math.round(((thisSum - prevSum) / prevSum) * 100);
      if (Math.abs(change) < 15) continue;
      const name = categoryName(categories, catId);
      if (change > 0) {
        out.push(
          makeInsight("insight", "category_mom", "insight.category_mom_up", {
            category: name,
            percent: Math.abs(change),
          }),
        );
      } else {
        out.push(
          makeInsight("insight", "category_mom", "insight.category_mom_down", {
            category: name,
            percent: Math.abs(change),
          }),
        );
      }
    }
  }

  const trailStart = dayjs().subtract(56, "day").format("YYYY-MM-DD");
  const trail = active.filter((e) => inRange(e.date, trailStart, periodEnd));
  const dowTotals = new Map<number, { total: number; count: number }>();
  for (const e of trail) {
    const dow = (dayjs(e.date).day() + 6) % 7;
    const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
    const amt = ok ? amountMinor : e.currency_code === baseCurrency ? e.amount_minor : null;
    if (amt == null) continue;
    const entry = dowTotals.get(dow) ?? { total: 0, count: 0 };
    entry.total += amt;
    entry.count += 1;
    dowTotals.set(dow, entry);
  }
  let peakDow = 0;
  let peakAvg = 0;
  for (const [dow, { total, count }] of dowTotals) {
    if (count === 0) continue;
    const avg = Math.round(total / count);
    if (avg > peakAvg) {
      peakAvg = avg;
      peakDow = dow;
    }
  }
  if (peakAvg > 0) {
    out.push(
      makeInsight("insight", "peak_weekday", "insight.peak_weekday", {
        weekday: WEEKDAYS[peakDow] ?? "Monday",
        amountMinor: peakAvg,
        currency: baseCurrency,
      }),
    );
  }

  for (const b of budgetItems) {
    const spent = sumCategory(current, b.categoryId, baseCurrency, fxRates);
    if (b.limitMinor <= 0) continue;
    const pct = Math.round((spent / b.limitMinor) * 100);
    const name = categoryName(categories, b.categoryId);
    if (pct >= 100) {
      out.push(
        makeInsight("alert", "budget_exceeded", "insight.budget_exceeded", {
          category: name,
          overMinor: spent - b.limitMinor,
          currency: baseCurrency,
        }),
      );
    } else if (pct >= 80) {
      out.push(
        makeInsight("alert", "budget_warning", "insight.budget_warning", {
          category: name,
          percent: pct,
        }),
      );
    }
  }

  const total = sumAll(current, baseCurrency, fxRates);
  if (total > 0) {
    const byCat = new Map<string, number>();
    for (const e of current) {
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      const amt = ok ? amountMinor : e.currency_code === baseCurrency ? e.amount_minor : null;
      if (amt == null) continue;
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + amt);
    }
    const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length >= 2) {
      const topTwo = ranked[0]![1] + ranked[1]![1];
      const pct = Math.round((topTwo / total) * 100);
      if (pct > 60) {
        out.push(
          makeInsight("insight", "category_concentration", "insight.category_concentration", {
            percent: pct,
          }),
        );
      }
    }
  }

  const lookbackStart = dayjs().subtract(90, "day").format("YYYY-MM-DD");
  const lookback = active.filter((e) => inRange(e.date, lookbackStart, periodEnd));
  const byCatAmounts = new Map<string, number[]>();
  for (const e of lookback) {
    const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
    const amt = ok ? amountMinor : e.currency_code === baseCurrency ? e.amount_minor : null;
    if (amt == null) continue;
    const list = byCatAmounts.get(e.category_id) ?? [];
    list.push(amt);
    byCatAmounts.set(e.category_id, list);
  }
  for (const e of current) {
    const med = median(byCatAmounts.get(e.category_id) ?? []);
    if (med <= 0) continue;
    const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
    const amt = ok ? amountMinor : e.currency_code === baseCurrency ? e.amount_minor : null;
    if (amt == null) continue;
    if (amt > med * 3) {
      out.push(
        makeInsight("alert", "unusual_transaction", "insight.unusual_transaction", {
          category: categoryName(categories, e.category_id),
          amountMinor: amt,
          currency: baseCurrency,
        }),
      );
      break;
    }
  }

  out.sort((a, b) => {
    const ar = a.kind === "alert" ? 0 : 1;
    const br = b.kind === "alert" ? 0 : 1;
    return ar - br;
  });
  return out.slice(0, 6);
}
