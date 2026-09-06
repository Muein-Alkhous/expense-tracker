// Trash: soft-deleted expenses with restore and permanent delete.

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { deletedExpenses } from "@/lib/expenseFilters";
import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { api, type TrashSnapshot } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import { useBudgets } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { getCategory, useExpenses } from "@/store/expenses";
import { useUi } from "@/store/ui";

export default function Trash() {
  const items = useExpenses((s) => s.items);
  const restoreExpense = useExpenses((s) => s.restoreExpense);
  const permanentDeleteExpense = useExpenses((s) => s.permanentDeleteExpense);
  const emptyTrash = useExpenses((s) => s.emptyTrash);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const loadCategories = useCategories((s) => s.loadFromDb);
  const loadBudgets = useBudgets((s) => s.loadFromDb);
  const [trash, setTrash] = useState<TrashSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTrash = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setTrash(await api.listTrash());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  const deleted = useMemo(() => {
    const list = deletedExpenses(items);
    return [...list].sort((a, b) => {
      const da = a.deleted_at ?? "";
      const db = b.deleted_at ?? "";
      return db.localeCompare(da);
    });
  }, [items]);

  async function handleRestore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreExpense(id);
      await loadTrash();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    const e = items.find((x) => x.id === id);
    const label = e?.note?.trim() || getCategory(e?.category_id ?? "")?.name || "this expense";
    if (
      !window.confirm(
        `Permanently delete "${`${label.slice(0, 60)}${label.length > 60 ? "…" : ""}`}"? This cannot be undone.`,
      )
    )
      return;
    setBusyId(id);
    setError(null);
    try {
      await permanentDeleteExpense(id);
      await loadTrash();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleEmptyTrash() {
    const total = deleted.length + (trash?.categories.length ?? 0) + (trash?.budgets.length ?? 0);
    if (total === 0) return;
    const noun = total === 1 ? "item" : "items";
    if (!window.confirm(`Permanently delete all ${total} ${noun} in trash? This cannot be undone.`)) return;
    setBusyId("all");
    setError(null);
    try {
      await emptyTrash();
      if (isTauri()) {
        await Promise.all([loadCategories(), loadBudgets(), loadTrash()]);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCategoryAction(id: string, action: "restore" | "delete") {
    if (
      action === "delete" &&
      !window.confirm(
        "Permanently delete this category? Any remaining linked records will be moved to Uncategorized.",
      )
    ) return;
    setBusyId(id);
    setError(null);
    try {
      if (action === "restore") await api.restoreCategory(id);
      else await api.permanentDeleteCategory(id);
      await Promise.all([loadCategories(), loadBudgets(), loadTrash()]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleBudgetAction(id: string, action: "restore" | "delete") {
    if (
      action === "delete" &&
      !window.confirm("Permanently delete this budget? This cannot be undone.")
    ) return;
    setBusyId(id);
    setError(null);
    try {
      if (action === "restore") await api.restoreBudget(id);
      else await api.permanentDeleteBudget(id);
      await Promise.all([loadBudgets(), loadTrash()]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyId(null);
    }
  }

  const totalDeleted =
    deleted.length + (trash?.categories.length ?? 0) + (trash?.budgets.length ?? 0);

  return (
    <div className="p-4 sm:p-8">
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
          {totalDeleted > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleEmptyTrash}
              disabled={busyId !== null}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
            >
              Empty trash
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-control border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
        >
          {error}
        </div>
      )}

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
                            onClick={() => void handleRestore(e.id)}
                            disabled={busyId !== null}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePermanentDelete(e.id)}
                            disabled={busyId !== null}
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

      {isTauri() && trash && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <TrashGroup
            title="Deleted categories"
            emptyLabel="No deleted categories."
            rows={trash.categories.map((category) => ({
              id: category.id,
              label: category.name,
              detail: category.deleted_at
                ? `Deleted ${formatDate(category.deleted_at.slice(0, 10), "MMM D, YYYY")}`
                : "Deleted",
            }))}
            busy={busyId !== null}
            onRestore={(id) => void handleCategoryAction(id, "restore")}
            onDelete={(id) => void handleCategoryAction(id, "delete")}
          />
          <TrashGroup
            title="Deleted budgets"
            emptyLabel="No deleted budgets."
            rows={trash.budgets.map((budget) => {
              const category =
                trash.categories.find((item) => item.id === budget.category_id) ??
                getCategory(budget.category_id ?? "");
              return {
                id: budget.id,
                label: budget.category_id
                  ? `${category?.name ?? "Category"} budget`
                  : "Overall monthly budget",
                detail: `${formatMinor(
                  budget.limit_amount_minor,
                  budget.currency_code,
                )} · ${budget.period_type}`,
              };
            })}
            busy={busyId !== null}
            onRestore={(id) => void handleBudgetAction(id, "restore")}
            onDelete={(id) => void handleBudgetAction(id, "delete")}
          />
        </div>
      )}
    </div>
  );
}

interface TrashGroupProps {
  title: string;
  emptyLabel: string;
  rows: { id: string; label: string; detail: string }[];
  busy: boolean;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function TrashGroup({
  title,
  emptyLabel,
  rows,
  busy,
  onRestore,
  onDelete,
}: TrashGroupProps) {
  return (
    <section className="rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-neutral-500 dark:text-neutral-400">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {row.label}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {row.detail}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(row.id)}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  Restore
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(row.id)}
                  className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                >
                  Delete forever
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
