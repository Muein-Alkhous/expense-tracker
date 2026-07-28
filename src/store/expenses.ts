// Expenses store: SQLite via Tauri when available, else localStorage persist.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, type NewExpenseInput } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import { SEED_EXPENSES } from "@/lib/seedData";
import type { Expense, PaymentMethod } from "@/types";

export { getCategory } from "@/store/categories";

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "transfer", label: "Transfer" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export type { NewExpenseInput };

interface ExpensesState {
  items: Expense[];
  hydrated: boolean;
  loadFromDb: () => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<Expense>;
  updateExpense: (id: string, input: NewExpenseInput) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (id: string) => Promise<void>;
  permanentDeleteExpense: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  replaceAll: (items: Expense[]) => void;
}

const storeImpl = (set: (partial: Partial<ExpensesState> | ((s: ExpensesState) => Partial<ExpensesState>)) => void, get: () => ExpensesState): ExpensesState => ({
  items: isTauri() ? [] : SEED_EXPENSES,
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
      return expense;
    }
    const now = new Date().toISOString();
    const expense: Expense = {
      id: crypto.randomUUID(),
      is_recurring: false,
      created_at: now,
      updated_at: now,
      ...input,
    };
    set((s) => ({ items: [expense, ...s.items] }));
    return expense;
  },

  updateExpense: async (id, input) => {
    if (isTauri()) {
      const expense = await api.updateExpense(id, input);
      set((s) => ({
        items: s.items.map((e) => (e.id === id ? expense : e)),
      }));
      return expense;
    }
    const now = new Date().toISOString();
    const existing = get().items.find((expense) => expense.id === id);
    if (!existing) {
      throw new Error("Expense not found.");
    }
    const expense: Expense = {
      ...existing,
      ...input,
      updated_at: now,
    };
    set((s) => ({
      items: s.items.map((item) => (item.id === id ? expense : item)),
    }));
    return expense;
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
