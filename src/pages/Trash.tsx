// Trash: soft-deleted expenses with restore and permanent delete.

import { useMemo } from "react";
import Button from "@/components/ui/Button";
import { deletedExpenses } from "@/lib/expenseFilters";
import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { getCategory, useExpenses } from "@/store/expenses";
import { useUi } from "@/store/ui";

export default function Trash() {
  const items = useExpenses((s) => s.items);
  const restoreExpense = useExpenses((s) => s.restoreExpense);
  const permanentDeleteExpense = useExpenses((s) => s.permanentDeleteExpense);
  const emptyTrash = useExpenses((s) => s.emptyTrash);
  const setCurrentPage = useUi((s) => s.setCurrentPage);

  const deleted = useMemo(() => {
    const list = deletedExpenses(items);
    return [...list].sort((a, b) => {
      const da = a.deleted_at ?? "";
      const db = b.deleted_at ?? "";
      return db.localeCompare(da);
    });
  }, [items]);

  function handleRestore(id: string) {
    restoreExpense(id);
  }

  function handlePermanentDelete(id: string) {
    const e = items.find((x) => x.id === id);
    const label = e?.note?.trim() || getCategory(e?.category_id ?? "")?.name || "this expense";
    if (
      !window.confirm(
        `Permanently delete "${`${label.slice(0, 60)}${label.length > 60 ? "…" : ""}`}"? This cannot be undone.`,
      )
    )
      return;
    permanentDeleteExpense(id);
  }

  function handleEmptyTrash() {
    if (deleted.length === 0) return;
    const noun = deleted.length === 1 ? "item" : "items";
    if (!window.confirm(`Permanently delete all ${deleted.length} ${noun} in trash? This cannot be undone.`)) return;
    emptyTrash();
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Trash</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
            Deleted expenses stay here until you restore them or remove them permanently. They are excluded from totals, budgets, and reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" type="button" onClick={() => setCurrentPage("expenses")}>
            Back to expenses
          </Button>
          {deleted.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleEmptyTrash}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
            >
              Empty trash
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {deleted.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Trash is empty. Deleted expenses will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-start text-xs uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Deleted</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 text-end font-medium">Amount</th>
                  <th className="px-4 py-3 text-end font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deleted.map((e) => {
                  const cat = getCategory(e.category_id);
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-neutral-100 dark:border-neutral-800"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-500 dark:text-neutral-400">
                        {e.deleted_at
                          ? formatDate(e.deleted_at.slice(0, 10), "MMM D, YYYY")
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-300">
                        {formatDate(e.date, "MMM D, YYYY")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: cat?.color ?? "#737373" }}
                          />
                          <span className="text-neutral-800 dark:text-neutral-200">
                            {cat?.name ?? "Uncategorized"}
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-neutral-700 dark:text-neutral-300">
                        {e.note ?? "—"}
                      </td>
                      <td className="px-4 py-3 capitalize text-neutral-500 dark:text-neutral-400">
                        {e.payment_method ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-end font-medium tabular-nums text-neutral-900 dark:text-neutral-50">
                        {formatMinor(e.amount_minor, e.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleRestore(e.id)}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePermanentDelete(e.id)}
                            className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                          >
                            Delete forever
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
