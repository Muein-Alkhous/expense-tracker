import type { Expense } from "@/types";

export function activeExpenses(items: Expense[]): Expense[] {
  return items.filter((e) => !e.deleted_at);
}
