import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { computeInsights } from "@/lib/insightsEngine";
import { periodRange, previousPeriodRange, type PeriodId } from "@/lib/period";
import { isTauri } from "@/lib/tauriEnv";
import { useBudgets } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import type { Insight } from "@/types/insight";

export function useInsights(period: PeriodId): {
  insights: Insight[];
  loading: boolean;
} {
  const expenses = useExpenses((s) => s.items);
  const categories = useCategories((s) => s.items);
  const budgetItems = useBudgets((s) => s.items);
  const fxRates = useFxRates((s) => s.rates);
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const range = periodRange(period);
    if (!range.start || !range.end) {
      setInsights([]);
      return;
    }

    const periodStart = range.start.format("YYYY-MM-DD");
    const periodEnd = range.end.format("YYYY-MM-DD");
    const prev = previousPeriodRange(period);
    const prevStart = prev?.start.format("YYYY-MM-DD");
    const prevEnd = prev?.end.format("YYYY-MM-DD");

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (isTauri()) {
          const rows = await api.getInsights({
            periodStart,
            periodEnd,
            prevStart: prevStart ?? null,
            prevEnd: prevEnd ?? null,
            baseCurrency,
          });
          if (!cancelled) setInsights(rows);
        } else {
          const rows = computeInsights({
            expenses,
            categories,
            budgetItems,
            fxRates,
            baseCurrency,
            periodStart,
            periodEnd,
            prevStart,
            prevEnd,
          });
          if (!cancelled) setInsights(rows);
        }
      } catch {
        if (!cancelled) setInsights([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    period,
    expenses,
    categories,
    budgetItems,
    fxRates,
    baseCurrency,
  ]);

  return { insights, loading };
}
