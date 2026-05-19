// Budgets store: per-category limits and overall monthly cap (in-memory until SQLite).
// Category budgets must sum to at most totalMonthlyMinor (master cap).

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CategoryBudget {
  categoryId: string;
  limitMinor: number;
}

interface BudgetsState {
  totalMonthlyMinor: number;
  items: CategoryBudget[];
  setTotalMonthly: (limitMinor: number) => boolean;
  setBudget: (categoryId: string, limitMinor: number) => boolean;
  removeBudget: (categoryId: string) => void;
  replaceAll: (data: { totalMonthlyMinor: number; items: CategoryBudget[] }) => void;
}

const seedBudgets: CategoryBudget[] = [
  { categoryId: "food", limitMinor: 10000 },
  { categoryId: "transport", limitMinor: 6000 },
  { categoryId: "bills", limitMinor: 12000 },
  { categoryId: "entertainment", limitMinor: 3000 },
  { categoryId: "shopping", limitMinor: 17000 },
];

export function sumCategoryBudgetsMinor(items: CategoryBudget[]): number {
  return items.reduce((acc, b) => acc + b.limitMinor, 0);
}

/** Sum of category limits if `categoryId` is set to `newLimitMinor`. */
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
  return (
    projectedCategorySumMinor(items, categoryId, newLimitMinor) <= totalMonthlyMinor
  );
}

/** Maximum limit allowed for one category without exceeding the monthly cap. */
export function maxCategoryBudgetMinor(
  items: CategoryBudget[],
  totalMonthlyMinor: number,
  categoryId: string,
): number {
  const othersSum = sumCategoryBudgetsMinor(
    items.filter((b) => b.categoryId !== categoryId),
  );
  return Math.max(0, totalMonthlyMinor - othersSum);
}

export function canSetTotalMonthly(
  items: CategoryBudget[],
  newTotalMinor: number,
): boolean {
  if (newTotalMinor <= 0) return false;
  return sumCategoryBudgetsMinor(items) <= newTotalMinor;
}

export const useBudgets = create<BudgetsState>()(
  persist(
    (set, get) => ({
  totalMonthlyMinor: 50000,
  items: seedBudgets,
  setTotalMonthly: (limitMinor) => {
    const { items } = get();
    if (!canSetTotalMonthly(items, limitMinor)) return false;
    set({ totalMonthlyMinor: limitMinor });
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
        items: items.map((b) =>
          b.categoryId === categoryId ? { ...b, limitMinor } : b,
        ),
      });
    } else {
      set({ items: [...items, { categoryId, limitMinor }] });
    }
    return true;
  },
  removeBudget: (categoryId) =>
    set((state) => ({
      items: state.items.filter((b) => b.categoryId !== categoryId),
    })),
  replaceAll: (data) => set(data),
    }),
    {
      name: "expense-tracker-budgets",
      partialize: (state) => ({
        totalMonthlyMinor: state.totalMonthlyMinor,
        items: state.items,
      }),
    },
  ),
);
