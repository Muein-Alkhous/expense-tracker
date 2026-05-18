// UI store: modal visibility, currently active screen.

import { create } from "zustand";

interface UiState {
  addExpenseOpen: boolean;
}

export const useUi = create<UiState>(() => ({
  addExpenseOpen: false,
}));
