// Single expense row showing date, category dot + name, note, payment method, and amount.

import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { getCategory } from "@/store/expenses";
import type { Expense } from "@/types";

interface ExpenseRowProps {
  expense: Expense;
}

export default function ExpenseRow({ expense }: ExpenseRowProps) {
  const category = getCategory(expense.category_id);

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
      <td className="px-4 py-3 text-sm italic text-neutral-600 dark:text-neutral-400">
        {expense.note ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm capitalize text-neutral-600 dark:text-neutral-400">
        {expense.payment_method ?? "—"}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-50">
        {formatMinor(expense.amount_minor, expense.currency_code)}
      </td>
    </tr>
  );
}
