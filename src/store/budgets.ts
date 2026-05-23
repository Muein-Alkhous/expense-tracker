// Budgets store: per-category limits and overall monthly cap.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import { persistBudgetsToDb } from "@/lib/dbBootstrap";
import { SEED_BUDGET_ITEMS, SEED_TOTAL_MONTHLY_MINOR } from "@/lib/seedData";
import { isTauri } from "@/lib/tauriEnv";

export interface CategoryBudget {
  categoryId: string;
  limitMinor: number;
}

interface BudgetsState {
  totalMonthlyMinor: number;
  items: CategoryBudget[];
  hydrated: boolean;
  loadFromDb: () => Promise<void>;
  setTotalMonthly: (limitMinor: number) => boolean;
  setBudget: (categoryId: string, limitMinor: number) => boolean;
  removeBudget: (categoryId: string) => void;
  replaceAll: (data: { totalMonthlyMinor: number; items: CategoryBudget[] }) => void;
}

export function sumCategoryBudgetsMinor(items: CategoryBudget[]): number {
  return items.reduce((acc, b) => acc + b.limitMinor, 0);
}

export function projectedCategorySumMinor(
  items: CategoryBudget[],
  categoryId: string,
  newLimitMinor: number,
): number {
  const others = items.filter((b) => b.categoryId !== categoryId);
  return sumCategoryBudgetsMinor(others) + newLimitMinor;
}

export function canSetCategoryBudget(
  items: CategoryBudget[],
  totalMonthlyMinor: number,
  categoryId: string,
  newLimitMinor: number,
): boolean {
  if (newLimitMinor <= 0) return false;
  return projectedCategorySumMinor(items, categoryId, newLimitMinor) <= totalMonthlyMinor;
}

export function maxCategoryBudgetMinor(
  items: CategoryBudget[],
  totalMonthlyMinor: number,
  categoryId: string,
): number {
  const othersSum = sumCategoryBudgetsMinor(items.filter((b) => b.categoryId !== categoryId));
  return Math.max(0, totalMonthlyMinor - othersSum);
}

export function canSetTotalMonthly(items: CategoryBudget[], newTotalMinor: number): boolean {
  if (newTotalMinor <= 0) return false;
  return sumCategoryBudgetsMinor(items) <= newTotalMinor;
}

async function syncDb(get: () => BudgetsState): Promise<void> {
  if (!isTauri()) return;
  const { totalMonthlyMinor, items } = get();
  await api.setBudgets({ totalMonthlyMinor, items });
}

const storeImpl = (set: (partial: Partial<BudgetsState> | ((s: BudgetsState) => Partial<BudgetsState>)) => void, get: () => BudgetsState): BudgetsState => ({
  totalMonthlyMinor: SEED_TOTAL_MONTHLY_MINOR,
  items: isTauri() ? [] : SEED_BUDGET_ITEMS,
  hydrated: !isTauri(),

  loadFromDb: async () => {
    if (!isTauri()) {
      set(() => ({ hydrated: true }));
      return;
    }
    const snapshot = await api.getBudgets();
    set(() => ({
      totalMonthlyMinor: snapshot.totalMonthlyMinor,
      items: snapshot.items,
      hydrated: true,
    }));
  },

  setTotalMonthly: (limitMinor) => {
    const { items } = get();
    if (!canSetTotalMonthly(items, limitMinor)) return false;
    set({ totalMonthlyMinor: limitMinor });
    void syncDb(get);
    return true;
  },

  setBudget: (categoryId, limitMinor) => {
    const { items, totalMonthlyMinor } = get();
    if (!canSetCategoryBudget(items, totalMonthlyMinor, categoryId, limitMinor)) {
      return false;
    }
    const exists = items.some((b) => b.categoryId === categoryId);
    if (exists) {
      set({
        items: items.map((b) => (b.categoryId === categoryId ? { ...b, limitMinor } : b)),
      });
    } else {
      set({ items: [...items, { categoryId, limitMinor }] });
    }
    void syncDb(get);
    return true;
  },

  removeBudget: (categoryId) => {
    set((state) => ({
      items: state.items.filter((b) => b.categoryId !== categoryId),
    }));
    void syncDb(get);
  },

  replaceAll: (data) => {
    set(data);
    void persistBudgetsToDb();
  },
});

export const useBudgets = isTauri()
  ? create<BudgetsState>()(storeImpl)
  : create<BudgetsState>()(
      persist(storeImpl, {
        name: "expense-tracker-budgets",
        partialize: (state) => ({
          totalMonthlyMinor: state.totalMonthlyMinor,
          items: state.items,
        }),
      }),
    );
