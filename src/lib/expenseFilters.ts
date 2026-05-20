import type { Expense } from "@/types";

export function activeExpenses(items: Expense[]): Expense[] {
  return items.filter((e) => !e.deleted_at);
}

/** Expenses that have been soft-deleted (have `deleted_at` set). */
export function deletedExpenses(items: Expense[]): Expense[] {
  return items.filter((e) => Boolean(e.deleted_at));
}
