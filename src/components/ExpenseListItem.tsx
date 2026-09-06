// Row used on the Expenses page list (flex layout).

import { formatDate } from "@/lib/date";
import { amountInBase } from "@/lib/expenseInBase";
import { formatMinor } from "@/lib/money";
import { getCategory, useExpenses } from "@/store/expenses";
import { useFxRates } from "@/store/fxRates";
import { useUi } from "@/store/ui";
import type { Expense } from "@/types";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank",
  transfer: "Transfer",
  other: "Other",
};

interface ExpenseListItemProps {
  expense: Expense;
  baseCurrency: string;
}

export default function ExpenseListItem({ expense, baseCurrency }: ExpenseListItemProps) {
  const fxRates = useFxRates((s) => s.rates);
  const deleteExpense = useExpenses((s) => s.deleteExpense);
  const openEditExpense = useUi((s) => s.openEditExpense);
  const category = getCategory(expense.category_id);
  const isForeign = expense.currency_code !== baseCurrency;
  const converted = amountInBase(expense, baseCurrency, fxRates);

  function handleDelete() {
    const label = expense.note?.trim() || category?.name || "this expense";
    if (
      !window.confirm(
        `Delete expense "${`${label.slice(0, 60)}${label.length > 60 ? "…" : ""}`}"?`,
      )
    ) {
      return;
    }
    deleteExpense(expense.id);
  }

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-neutral-100 px-4 py-4 text-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50 sm:px-6 lg:grid-cols-12 lg:py-3">
      <div className="col-span-1 text-xs text-neutral-500 lg:text-sm">{formatDate(expense.date, "MMM D")}</div>
      <div className="col-span-1 inline-flex items-center justify-self-end gap-2 text-neutral-700 dark:text-neutral-300 lg:col-span-2 lg:justify-self-auto">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: category?.color ?? "#737373" }}
        />
        <span className="min-w-0 truncate">{category?.name ?? "Uncategorized"}</span>
      </div>
      <div className="col-span-1 truncate text-neutral-700 dark:text-neutral-300 lg:col-span-4">
        {expense.note ?? <span className="italic text-neutral-400">No note</span>}
      </div>
      <div className="hidden capitalize text-neutral-500 lg:col-span-2 lg:block">
        {expense.payment_method
          ? (PAYMENT_LABELS[expense.payment_method] ?? expense.payment_method)
          : "—"}
      </div>
      <div className="col-span-1 text-end tabular-nums lg:col-span-2">
        <div className="font-medium text-neutral-900 dark:text-neutral-50">
          {formatMinor(expense.amount_minor, expense.currency_code)}
        </div>
        {isForeign && converted.ok && (
          <div className="text-xs text-neutral-400">
            ≈ {formatMinor(converted.amountMinor, baseCurrency)}
          </div>
        )}
        {isForeign && !converted.ok && (
          <div className="text-xs text-amber-500 dark:text-amber-400">No FX rate</div>
        )}
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 lg:col-span-1 lg:gap-1">
        <button
          type="button"
          aria-label="Edit expense"
          onClick={() => openEditExpense(expense.id)}
          className="rounded-control p-2.5 text-neutral-400 hover:bg-neutral-100 hover:text-accent dark:hover:bg-neutral-800 dark:hover:text-accent lg:p-1.5"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Delete expense"
          onClick={handleDelete}
          className="rounded-control p-2.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 lg:p-1.5"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
          </svg>
        </button>
      </div>
    </li>
  );
}
