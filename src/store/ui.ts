// UI store: current page, modal visibility, and other transient app state.

import type { PeriodId } from "@/lib/period";
import { create } from "zustand";

export type PageId =
  | "dashboard"
  | "expenses"
  | "categories"
  | "budgets"
  | "reports"
  | "settings";

interface UiState {
  currentPage: PageId;
  setCurrentPage: (page: PageId) => void;
  dashboardPeriod: PeriodId;
  setDashboardPeriod: (period: PeriodId) => void;
  addExpenseOpen: boolean;
  /** When non-null, the add-expense modal is editing this expense ID. */
  editingExpenseId: string | null;
  openAddExpense: () => void;
  closeAddExpense: () => void;
  openEditExpense: (id: string) => void;
  newBudgetOpen: boolean;
  newBudgetCategoryId: string | null;
  openNewBudget: (categoryId?: string) => void;
  closeNewBudget: () => void;
  exportCsvOpen: boolean;
  openExportCsv: () => void;
  closeExportCsv: () => void;
}

export const useUi = create<UiState>((set) => ({
  currentPage: "dashboard",
  setCurrentPage: (page) => set({ currentPage: page }),
  dashboardPeriod: "this_month",
  setDashboardPeriod: (period) => set({ dashboardPeriod: period }),
  addExpenseOpen: false,
  editingExpenseId: null,
  openAddExpense: () => set({ addExpenseOpen: true, editingExpenseId: null }),
  closeAddExpense: () => set({ addExpenseOpen: false, editingExpenseId: null }),
  openEditExpense: (id) => set({ addExpenseOpen: true, editingExpenseId: id }),
  newBudgetOpen: false,
  newBudgetCategoryId: null,
  openNewBudget: (categoryId) =>
    set({ newBudgetOpen: true, newBudgetCategoryId: categoryId ?? null }),
  closeNewBudget: () => set({ newBudgetOpen: false, newBudgetCategoryId: null }),
  exportCsvOpen: false,
  openExportCsv: () => set({ exportCsvOpen: true }),
  closeExportCsv: () => set({ exportCsvOpen: false }),
}));
