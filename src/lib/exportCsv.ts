// CSV export helpers for expense data.

import dayjs from "dayjs";
import { toMajor } from "@/lib/money";
import type { Category } from "@/types";
import type { Expense } from "@/types";

export type ExportPeriod = "this_month" | "last_month" | "last_30" | "all";

export interface ExportColumnFlags {
  date: boolean;
  amount: boolean;
  currency: boolean;
  category: boolean;
  note: boolean;
  payment: boolean;
  tags: boolean;
}

export const DEFAULT_EXPORT_COLUMNS: ExportColumnFlags = {
  date: true,
  amount: true,
  currency: true,
  category: true,
  note: true,
  payment: true,
  tags: true,
};

const PERIOD_LABELS: Record<ExportPeriod, string> = {
  this_month: "this_month",
  last_month: "last_month",
  last_30: "last_30_days",
  all: "all_time",
};

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function filterExpensesByPeriod(
  expenses: Expense[],
  period: ExportPeriod,
): Expense[] {
  if (period === "all") return [...expenses];

  const now = dayjs();
  return expenses.filter((e) => {
    const d = dayjs(e.date);
    if (period === "this_month") return d.isSame(now, "month");
    if (period === "last_month") {
      const start = now.subtract(1, "month").startOf("month");
      const end = now.subtract(1, "month").endOf("month");
      return (
        (d.isAfter(start) || d.isSame(start, "day")) &&
        (d.isBefore(end) || d.isSame(end, "day"))
      );
    }
    const cutoff = now.subtract(30, "day").startOf("day");
    return d.isAfter(cutoff) || d.isSame(cutoff, "day");
  });
}

export function buildExpensesCsv(
  expenses: Expense[],
  categories: Category[],
  columns: ExportColumnFlags,
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const headers: string[] = [];
  if (columns.date) headers.push("date");
  if (columns.amount) headers.push("amount");
  if (columns.currency) headers.push("currency");
  if (columns.category) headers.push("category");
  if (columns.note) headers.push("note");
  if (columns.payment) headers.push("payment_method");
  if (columns.tags) headers.push("tags");

  const rows = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((e) => {
      const cells: string[] = [];
      if (columns.date) cells.push(csvCell(e.date));
      if (columns.amount) {
        cells.push(
          csvCell(String(toMajor(e.amount_minor, e.currency_code))),
        );
      }
      if (columns.currency) cells.push(csvCell(e.currency_code));
      if (columns.category) {
        cells.push(csvCell(catMap.get(e.category_id) ?? e.category_id));
      }
      if (columns.note) cells.push(csvCell(e.note ?? ""));
      if (columns.payment) cells.push(csvCell(e.payment_method ?? ""));
      if (columns.tags) cells.push(csvCell((e.tags ?? []).join("; ")));
      return cells.join(",");
    });

  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(content: string, period: ExportPeriod): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expense_tracker_${PERIOD_LABELS[period]}_${dayjs().format("YYYY-MM-DD")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
