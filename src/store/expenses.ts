// Expenses store: SQLite via Tauri when available, else localStorage persist.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, type NewExpenseInput } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import type { Expense, PaymentMethod } from "@/types";

export { getCategory } from "@/store/categories";

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "transfer", label: "Transfer" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
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

export type { NewExpenseInput };

interface ExpensesState {
  items: Expense[];
  hydrated: boolean;
  loadFromDb: () => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<void>;
  updateExpense: (id: string, input: NewExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (id: string) => Promise<void>;
  permanentDeleteExpense: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  replaceAll: (items: Expense[]) => void;
}

const storeImpl = (set: (partial: Partial<ExpensesState> | ((s: ExpensesState) => Partial<ExpensesState>)) => void, _get: () => ExpensesState): ExpensesState => ({
  items: isTauri() ? [] : seedExpenses,
  hydrated: !isTauri(),

  loadFromDb: async () => {
    if (!isTauri()) {
      set(() => ({ hydrated: true }));
      return;
    }
    const items = await api.listExpenses();
    set(() => ({ items, hydrated: true }));
  },

  addExpense: async (input) => {
    if (isTauri()) {
      const expense = await api.createExpense(input);
      set((s) => ({ items: [expense, ...s.items] }));
      return;
    }
    set((s) => ({
      items: [
        {
          id: crypto.randomUUID(),
          is_recurring: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...input,
        },
        ...s.items,
      ],
    }));
  },

  updateExpense: async (id, input) => {
    if (isTauri()) {
      const expense = await api.updateExpense(id, input);
      set((s) => ({
        items: s.items.map((e) => (e.id === id ? expense : e)),
      }));
      return;
    }
    const now = new Date().toISOString();
    set((s) => ({
      items: s.items.map((e) =>
        e.id === id
          ? {
              ...e,
              amount_minor: input.amount_minor,
              currency_code: input.currency_code,
              category_id: input.category_id,
              date: input.date,
              note: input.note,
              payment_method: input.payment_method,
              tags: input.tags,
              updated_at: now,
            }
          : e,
      ),
    }));
  },

  deleteExpense: async (id) => {
    if (isTauri()) {
      await api.softDeleteExpense(id);
      const now = new Date().toISOString();
      set((s) => ({
        items: s.items.map((e) =>
          e.id === id ? { ...e, deleted_at: now, updated_at: now } : e,
        ),
      }));
      return;
    }
    const now = new Date().toISOString();
    set((s) => ({
      items: s.items.map((e) =>
        e.id === id ? { ...e, deleted_at: now, updated_at: now } : e,
      ),
    }));
  },

  restoreExpense: async (id) => {
    if (isTauri()) {
      await api.restoreExpense(id);
      const now = new Date().toISOString();
      set((s) => ({
        items: s.items.map((e) =>
          e.id === id ? { ...e, deleted_at: undefined, updated_at: now } : e,
        ),
      }));
      return;
    }
    const now = new Date().toISOString();
    set((s) => ({
      items: s.items.map((e) =>
        e.id === id ? { ...e, deleted_at: undefined, updated_at: now } : e,
      ),
    }));
  },

  permanentDeleteExpense: async (id) => {
    if (isTauri()) {
      await api.permanentDeleteExpense(id);
    }
    set((s) => ({ items: s.items.filter((e) => e.id !== id) }));
  },

  emptyTrash: async () => {
    if (isTauri()) {
      await api.emptyTrash();
    }
    set((s) => ({ items: s.items.filter((e) => !e.deleted_at) }));
  },

  replaceAll: (items) => set(() => ({ items })),
});

export const useExpenses = isTauri()
  ? create<ExpensesState>()(storeImpl)
  : create<ExpensesState>()(
      persist(storeImpl, {
        name: "expense-tracker-expenses",
        partialize: (state) => ({ items: state.items }),
      }),
    );
