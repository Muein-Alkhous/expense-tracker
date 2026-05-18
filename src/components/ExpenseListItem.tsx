// Row used in the Expenses page list (flex layout, not a table row).

import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { getCategory } from "@/store/expenses";
import type { Expense } from "@/types";

interface ExpenseListItemProps {
  expense: Expense;
  baseCurrency: string;
}

export default function ExpenseListItem({ expense, baseCurrency }: ExpenseListItemProps) {
  const category = getCategory(expense.category_id);
  const isForeign = expense.currency_code !== baseCurrency;

  return (
    <li className="grid grid-cols-12 items-center gap-4 border-t border-neutral-100 px-6 py-3 text-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
      <div className="col-span-1 text-neutral-500">{formatDate(expense.date, "MMM D")}</div>
      <div className="col-span-2 inline-flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: category?.color ?? "#737373" }}
        />
        {category?.name ?? "Uncategorized"}
      </div>
      <div className="col-span-5 truncate text-neutral-700 dark:text-neutral-300">
        {expense.note ?? <span className="italic text-neutral-400">No note</span>}
      </div>
      <div className="col-span-2 capitalize text-neutral-500">{expense.payment_method ?? "—"}</div>
      <div className="col-span-2 text-right tabular-nums">
        <div className="font-medium text-neutral-900 dark:text-neutral-50">
          {formatMinor(expense.amount_minor, expense.currency_code)}
        </div>
        {isForeign && (
          <div className="text-xs text-neutral-400">
            ≈ {formatMinor(expense.amount_minor, baseCurrency)}
          </div>
        )}
      </div>
    </li>
  );
}
