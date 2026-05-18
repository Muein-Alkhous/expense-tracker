// UI store: current page, modal visibility, and other transient app state.

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
  addExpenseOpen: boolean;
  openAddExpense: () => void;
  closeAddExpense: () => void;
}

export const useUi = create<UiState>((set) => ({
  currentPage: "dashboard",
  setCurrentPage: (page) => set({ currentPage: page }),
  addExpenseOpen: false,
  openAddExpense: () => set({ addExpenseOpen: true }),
  closeAddExpense: () => set({ addExpenseOpen: false }),
}));
