// Expenses store: cached list, current filters, search state.

import { create } from "zustand";
import type { Expense } from "@/types";

interface ExpensesState {
  items: Expense[];
  search: string;
}

export const useExpenses = create<ExpensesState>(() => ({
  items: [],
  search: "",
}));
