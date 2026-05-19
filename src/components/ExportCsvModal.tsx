// Modal to configure and download an expenses CSV export.

import { useEffect, useState, type FormEvent } from "react";
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

const PERIODS: { id: ExportPeriod; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_30", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

const COLUMN_OPTIONS: { key: keyof ExportColumnFlags; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency" },
  { key: "category", label: "Category" },
  { key: "note", label: "Note" },
  { key: "payment", label: "Payment method" },
  { key: "tags", label: "Tags" },
];

export default function ExportCsvModal() {
  const open = useUi((s) => s.exportCsvOpen);
  const close = useUi((s) => s.closeExportCsv);
  const expenses = useExpenses((s) => s.items);
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

  const filteredCount = filterExpensesByPeriod(expenses, period).length;

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

    const filtered = filterExpensesByPeriod(expenses, period);
    if (filtered.length === 0) {
      setError("No expenses match this date range.");
      return;
    }

    const csv = buildExpensesCsv(filtered, categories, columns);
    downloadCsv(csv, period);
    close();
  }

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
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">
                {filteredCount}
              </span>
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleExport} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Date range
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPeriod(p.id);
                  setError(null);
                }}
                className={
                  "rounded-control border px-3 py-2 text-left text-sm transition-colors " +
                  (period === p.id
                    ? "border-accent bg-accent/5 font-medium text-accent"
                    : "border-neutral-200 text-neutral-700 hover:border-neutral-300")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {filteredCount === 0
              ? "No transactions in this range."
              : `${filteredCount} transaction${filteredCount === 1 ? "" : "s"} will be exported.`}
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Columns
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COLUMN_OPTIONS.map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-control border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={columns[key]}
                  onChange={() => toggleColumn(key)}
                  className="h-4 w-4 rounded border-neutral-300 text-accent focus:ring-accent"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
