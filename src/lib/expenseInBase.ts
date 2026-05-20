// Convert expense amounts to the user's base currency for totals and charts.

import { convertMinor } from "@/lib/fx";
import type { FxRate } from "@/types/fx";

export interface ExpenseLike {
  amount_minor: number;
  currency_code: string;
  date: string;
}

export function amountInBase(
  expense: ExpenseLike,
  baseCurrency: string,
  rates: FxRate[],
) {
  return convertMinor(
    expense.amount_minor,
    expense.currency_code,
    baseCurrency,
    expense.date,
    rates,
  );
}

export interface SumInBaseResult {
  totalMinor: number;
  convertedCount: number;
  skippedCount: number;
}

export function sumExpensesInBase(
  expenses: ExpenseLike[],
  baseCurrency: string,
  rates: FxRate[],
): SumInBaseResult {
  let totalMinor = 0;
  let convertedCount = 0;
  let skippedCount = 0;

  for (const e of expenses) {
    const { amountMinor, ok } = amountInBase(e, baseCurrency, rates);
    if (ok) {
      totalMinor += amountMinor;
      convertedCount += 1;
    } else if (e.currency_code !== baseCurrency) {
      skippedCount += 1;
    } else {
      totalMinor += e.amount_minor;
      convertedCount += 1;
    }
  }

  return { totalMinor, convertedCount, skippedCount };
}

export function countMissingFx(
  expenses: ExpenseLike[],
  baseCurrency: string,
  rates: FxRate[],
): number {
  return expenses.filter((e) => {
    if (e.currency_code === baseCurrency) return false;
    return !amountInBase(e, baseCurrency, rates).ok;
  }).length;
}
