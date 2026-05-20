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

function normalizeRate(row: Omit<FxRate, "id">): Omit<FxRate, "id"> | null {
  const from = row.from_code.toUpperCase();
  const to = row.to_code.toUpperCase();
  const rate = Number(row.rate);
  if (!from || !to || from === to || !Number.isFinite(rate) || rate <= 0) return null;
  if (from < to) {
    return { ...row, from_code: from, to_code: to, rate };
  }
  return { ...row, from_code: to, to_code: from, rate: 1 / rate };
}

function mergeRates(existing: FxRate[], incoming: Omit<FxRate, "id">[]): FxRate[] {
  const merged = [...existing];
  for (const row of incoming) {
    const normalized = normalizeRate(row);
    if (!normalized) continue;
    const idx = merged.findIndex(
      (r) =>
        r.from_code === normalized.from_code &&
        r.to_code === normalized.to_code &&
        r.as_of_date === normalized.as_of_date,
    );
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...normalized };
    } else {
      merged.push({ ...normalized, id: crypto.randomUUID() });
    }
  }
  return merged;
}

function normalizeStoredRates(rows: FxRate[]): FxRate[] {
  return mergeRates([], rows.map(({ id: _id, ...rest }) => rest));
}

export const useFxRates = create<FxRatesState>()(
  persist(
    (set, get) => ({
      rates: [],

      addRate: (row) =>
        set((state) => ({
          rates: mergeRates(state.rates, [row]),
        })),

      updateRate: (id, patch) =>
        set((state) => {
          const target = state.rates.find((r) => r.id === id);
          if (!target) return state;
          const { id: _oldId, ...rest } = target;
          const updated = { ...rest, ...patch };
          return {
            rates: mergeRates(
              state.rates.filter((r) => r.id !== id),
              [updated],
            ),
          };
        }),

      removeRate: (id) =>
        set((state) => ({
          rates: state.rates.filter((r) => r.id !== id),
        })),

      replaceAll: (rates) => set({ rates: normalizeStoredRates(rates) }),


      importRates: (rows) =>
        set((state) => ({
          rates: mergeRates(state.rates, rows),
        })),

      seedDefaultsIfEmpty: () => {
        if (get().rates.length > 0) return;
        const asOf = toDateKey(new Date().toISOString());
        set({ rates: mergeRates([], buildSeedRates(asOf)) });
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
          set((state) => ({ rates: mergeRates(state.rates, fetched) }));
        }
        return { added: fetched.length, skipped };
      },
    }),
    {
      name: "expense-tracker-fx-rates",
      version: 2,
      migrate: (persisted) => {
        const raw = (persisted as { rates?: FxRate[] } | undefined)?.rates ?? [];
        return { rates: normalizeStoredRates(raw) };
      },
      partialize: (state) => ({ rates: state.rates }),
    },
  ),
);
