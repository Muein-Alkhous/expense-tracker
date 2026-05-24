// Modal to configure and download an expenses CSV export.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import {
  buildExpensesCsv,
  DEFAULT_EXPORT_COLUMNS,
  downloadCsv,
  filterExpensesByPeriod,
  type ExportColumnFlags,
  type ExportPeriod,
} from "@/lib/exportCsv";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useUi } from "@/store/ui";
import { activeExpenses } from "@/lib/expenseFilters";

const PERIOD_IDS: ExportPeriod[] = ["this_month", "last_month", "last_30", "all"];

const PERIOD_LABELS: Record<ExportPeriod, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_30: "Last 30 days",
  all: "All time",
};

const COLUMN_KEYS: (keyof ExportColumnFlags)[] = [
  "date",
  "amount",
  "currency",
  "category",
  "note",
  "payment",
  "tags",
];

const COLUMN_LABELS: Record<keyof ExportColumnFlags, string> = {
  date: "Date",
  amount: "Amount",
  currency: "Currency",
  category: "Category",
  note: "Note",
  payment: "Payment method",
  tags: "Tags",
};

function periodButtonClass(selected: boolean): string {
  const base =
    "rounded-control border px-3 py-2 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900";
  if (selected) {
    return (
      base +
      " border-accent bg-accent/10 font-medium text-accent dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100"
    );
  }
  return (
    base +
    " border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
  );
}

function columnLabelClass(checked: boolean): string {
  const base =
    "flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-neutral-900";
  if (checked) {
    return (
      base +
      " border-accent/60 bg-accent/5 text-neutral-900 dark:border-indigo-400/50 dark:bg-indigo-500/15 dark:text-neutral-100"
    );
  }
  return (
    base +
    " border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
  );
}

export default function ExportCsvModal() {
  const open = useUi((s) => s.exportCsvOpen);
  const close = useUi((s) => s.closeExportCsv);
  const expenses = useExpenses((s) => s.items);
  const activeOnly = useMemo(() => activeExpenses(expenses), [expenses]);
  const categories = useCategories((s) => s.items);

  const [period, setPeriod] = useState<ExportPeriod>("this_month");
  const [columns, setColumns] = useState<ExportColumnFlags>(DEFAULT_EXPORT_COLUMNS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeriod("this_month");
    setColumns({ ...DEFAULT_EXPORT_COLUMNS });
    setError(null);
  }, [open]);

  const filteredCount = filterExpensesByPeriod(activeOnly, period).length;

  function toggleColumn(key: keyof ExportColumnFlags) {
    setColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyOn = Object.values(next).some(Boolean);
      if (!anyOn) return prev;
      return next;
    });
  }

  function handleExport(e?: FormEvent) {
    e?.preventDefault();
    const hasColumn = Object.values(columns).some(Boolean);
    if (!hasColumn) {
      setError("Select at least one column.");
      return;
    }

    const filtered = filterExpensesByPeriod(activeOnly, period);
    if (filtered.length === 0) {
      setError("No expenses match this date range.");
      return;
    }

    const csv = buildExpensesCsv(filtered, categories, columns);
    downloadCsv(csv, period);
    close();
  }

  const exportCountLabel =
    filteredCount === 0
      ? "No transactions in this range."
      : `${filteredCount} transaction${filteredCount === 1 ? "" : "s"} will be exported.`;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Export CSV"
      widthClass="w-[520px]"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => handleExport()}>
            Download CSV
            {filteredCount > 0 && (
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium dark:bg-black/25">
                {filteredCount}
              </span>
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleExport} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Date range
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PERIOD_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPeriod(id);
                  setError(null);
                }}
                className={periodButtonClass(period === id)}
              >
                {PERIOD_LABELS[id]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {exportCountLabel}
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Columns
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className={columnLabelClass(columns[key])}>
                <input
                  type="checkbox"
                  checked={columns[key]}
                  onChange={() => toggleColumn(key)}
                  className="h-4 w-4 rounded border-neutral-300 text-accent focus:ring-accent dark:border-neutral-500 dark:bg-neutral-900 dark:checked:border-indigo-400 dark:checked:bg-indigo-500"
                />
                <span className="select-none">{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
