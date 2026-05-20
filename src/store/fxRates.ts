// Local FX rates store (spec §11.6).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toDateKey } from "@/lib/date";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { buildSeedRates, fetchRatesFromApi } from "@/lib/fx";
import type { FxRate } from "@/types/fx";

interface FxRatesState {
  rates: FxRate[];
  addRate: (row: Omit<FxRate, "id">) => void;
  updateRate: (id: string, patch: Partial<Pick<FxRate, "from_code" | "to_code" | "rate" | "as_of_date">>) => void;
  removeRate: (id: string) => void;
  replaceAll: (rates: FxRate[]) => void;
  importRates: (rows: Omit<FxRate, "id">[]) => void;
  seedDefaultsIfEmpty: () => void;
  fetchLatest: (baseCurrency: string) => Promise<{ added: number; skipped: string[] }>;
}

function withIds(rows: Omit<FxRate, "id">[]): FxRate[] {
  return rows.map((r) => ({ ...r, id: crypto.randomUUID() }));
}

export const useFxRates = create<FxRatesState>()(
  persist(
    (set, get) => ({
      rates: [],

      addRate: (row) =>
        set((state) => ({
          rates: [...state.rates, { ...row, id: crypto.randomUUID() }],
        })),

      updateRate: (id, patch) =>
        set((state) => ({
          rates: state.rates.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRate: (id) =>
        set((state) => ({
          rates: state.rates.filter((r) => r.id !== id),
        })),

      replaceAll: (rates) => set({ rates }),

      importRates: (rows) =>
        set((state) => ({
          rates: [...state.rates, ...withIds(rows)],
        })),

      seedDefaultsIfEmpty: () => {
        if (get().rates.length > 0) return;
        const asOf = toDateKey(new Date().toISOString());
        set({ rates: withIds(buildSeedRates(asOf)) });
      },

      fetchLatest: async (baseCurrency) => {
        const targets = [...SUPPORTED_CURRENCIES];
        const fetched = await fetchRatesFromApi(baseCurrency, targets);
        const skipped = targets.filter(
          (c) =>
            c !== baseCurrency &&
            !fetched.some((r) => r.from_code === baseCurrency && r.to_code === c),
        );
        if (fetched.length > 0) {
          set((state) => ({ rates: [...state.rates, ...withIds(fetched)] }));
        }
        return { added: fetched.length, skipped };
      },
    }),
    {
      name: "expense-tracker-fx-rates",
      partialize: (state) => ({ rates: state.rates }),
    },
  ),
);
