// Base currency + FX rates for converting expenses in components.

import { amountInBase, countMissingFx, sumExpensesInBase } from "@/lib/expenseInBase";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import type { Expense } from "@/types";

export function useFxConversion() {
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const fxRates = useFxRates((s) => s.rates);

  return {
    baseCurrency,
    fxRates,
    toBase: (expense: { amount_minor: number; currency_code: string; date: string }) =>
      amountInBase(expense, baseCurrency, fxRates),
    sumInBase: (expenses: { amount_minor: number; currency_code: string; date: string }[]) =>
      sumExpensesInBase(expenses, baseCurrency, fxRates),
    countMissing: (expenses: { amount_minor: number; currency_code: string; date: string }[]) =>
      countMissingFx(expenses, baseCurrency, fxRates),
  };
}

export type { Expense };
