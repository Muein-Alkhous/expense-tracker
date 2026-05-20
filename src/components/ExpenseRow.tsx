// Single expense row showing date, category dot + name, note, payment method, amount, and delete.

import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { getCategory, useExpenses } from "@/store/expenses";
import type { Expense } from "@/types";

interface ExpenseRowProps {
  expense: Expense;
}

export default function ExpenseRow({ expense }: ExpenseRowProps) {
  const category = getCategory(expense.category_id);
  const deleteExpense = useExpenses((s) => s.deleteExpense);

  function handleDelete() {
    const label = expense.note?.trim() || expense.category_id || "this expense";
    if (
      !window.confirm(`Delete expense "${label.slice(0, 60)}${label.length > 60 ? "…" : ""}"?`)
    ) {
      return;
    }
    deleteExpense(expense.id);
  }

  return (
    <tr className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
        {formatDate(expense.date, "MMM D, YYYY")}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: category?.color ?? "#737373" }}
          />
          <span className="text-neutral-700 dark:text-neutral-300">
            {category?.name ?? "Uncategorized"}
          </span>
        </span>
      </td>
      <td className="max-w-[12rem] truncate px-4 py-3 text-sm italic text-neutral-600 dark:text-neutral-400">
        {expense.note ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm capitalize text-neutral-600 dark:text-neutral-400">
        {expense.payment_method ?? "—"}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-50">
        {formatMinor(expense.amount_minor, expense.currency_code)}
      </td>
      <td className="px-2 py-3 text-right">
        <button
          type="button"
          aria-label="Delete expense"
          onClick={handleDelete}
          className="rounded-control p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
