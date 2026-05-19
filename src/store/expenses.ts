// Expenses store: in-memory list with a seed of sample data.
// Will be replaced by a Tauri-backed store once the Rust backend lands.

import { create } from "zustand";
import type { Expense, PaymentMethod } from "@/types";

export { getCategory } from "@/store/categories";

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "transfer", label: "Transfer" },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const seedExpenses: Expense[] = [
  { id: "1", amount_minor: 4250, currency_code: "USD", category_id: "food", date: daysAgo(0), note: "Sushi dinner", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
  { id: "2", amount_minor: 1200, currency_code: "USD", category_id: "transport", date: daysAgo(0), note: "Gas station", payment_method: "cash", is_recurring: false, created_at: "", updated_at: "" },
  { id: "3", amount_minor: 11000, currency_code: "USD", category_id: "bills", date: daysAgo(1), note: "Internet fiber", payment_method: "bank", is_recurring: true, created_at: "", updated_at: "" },
  { id: "4", amount_minor: 8420, currency_code: "USD", category_id: "shopping", date: daysAgo(2), note: "New sneakers", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
  { id: "5", amount_minor: 2200, currency_code: "USD", category_id: "entertainment", date: daysAgo(3), note: "Cinema", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
  { id: "6", amount_minor: 1850, currency_code: "USD", category_id: "food", date: daysAgo(4), note: "Lunch at Joe's", payment_method: "cash", is_recurring: false, created_at: "", updated_at: "" },
  { id: "7", amount_minor: 3500, currency_code: "USD", category_id: "food", date: daysAgo(6), note: "Groceries", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
  { id: "8", amount_minor: 2400, currency_code: "USD", category_id: "transport", date: daysAgo(7), note: "Uber", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
  { id: "9", amount_minor: 6700, currency_code: "USD", category_id: "shopping", date: daysAgo(10), note: "Headphones", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
  { id: "10", amount_minor: 1500, currency_code: "USD", category_id: "entertainment", date: daysAgo(12), note: "Netflix", payment_method: "card", is_recurring: true, created_at: "", updated_at: "" },
];

interface NewExpenseInput {
  amount_minor: number;
  currency_code: string;
  category_id: string;
  date: string;
  note?: string;
  payment_method?: PaymentMethod;
  tags?: string[];
}

interface ExpensesState {
  items: Expense[];
  addExpense: (input: NewExpenseInput) => void;
}

export const useExpenses = create<ExpensesState>((set) => ({
  items: seedExpenses,
  addExpense: (input) =>
    set((state) => ({
      items: [
        {
          id: crypto.randomUUID(),
          is_recurring: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...input,
        },
        ...state.items,
      ],
    })),
}));
