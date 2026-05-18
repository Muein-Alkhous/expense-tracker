// UI store: modal visibility and other transient app state.

import { create } from "zustand";

interface UiState {
  addExpenseOpen: boolean;
  openAddExpense: () => void;
  closeAddExpense: () => void;
}

export const useUi = create<UiState>((set) => ({
  addExpenseOpen: false,
  openAddExpense: () => set({ addExpenseOpen: true }),
  closeAddExpense: () => set({ addExpenseOpen: false }),
}));
