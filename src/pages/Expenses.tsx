// Expenses screen: searchable, filterable transaction list grouped by day.

import { useMemo, useState } from "react";
import { deletedExpenses } from "@/lib/expenseFilters";
import { useUi } from "@/store/ui";
import FilterDropdown, { type FilterOption } from "@/components/FilterDropdown";
import ExpenseListItem from "@/components/ExpenseListItem";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { formatDate } from "@/lib/date";
import { PERIOD_OPTIONS } from "@/lib/period";
import { amountInBase, sumExpensesInBase } from "@/lib/expenseInBase";
import type { FxRate } from "@/types/fx";
import { formatMinor } from "@/lib/money";
import { useFxRates } from "@/store/fxRates";
import dayjs from "dayjs";
import type { Expense } from "@/types";
import { periodRange, type PeriodId } from "@/lib/period";

import { useSettings } from "@/store/settings";

const DEFAULT_FILTERS = {
  search: "",
  category: "all",
  period: "this_month",
  payment: "all",
};

const PAYMENT_OPTIONS: FilterOption[] = [
  { id: "all", label: "All payment methods" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function Expenses() {
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const fxRates = useFxRates((s) => s.rates);
  const items = useExpenses((s) => s.items);
  const categories = useCategories((s) => s.items);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const trashCount = useMemo(() => deletedExpenses(items).length, [items]);

  const categoryOptions: FilterOption[] = useMemo(
    () => [
      { id: "all", label: "All categories" },
      ...categories.map((c) => ({ id: c.id, label: c.name })),
    ],
    [categories],
  );

  const periodOptions: FilterOption[] = useMemo(
    () => PERIOD_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    [],
  );

  const filtered = useMemo(
    () => filterExpenses(items, filters, categories),
    [items, filters, categories],
  );

  const total = useMemo(
    () => sumExpensesInBase(filtered, baseCurrency, fxRates).totalMinor,
    [filtered, baseCurrency, fxRates],
  );

  const groups = useMemo(
    () => groupByDay(filtered, baseCurrency, fxRates),
    [filtered, baseCurrency, fxRates],
  );

  const isFiltered =
    filters.search !== DEFAULT_FILTERS.search ||
    filters.category !== DEFAULT_FILTERS.category ||
    filters.period !== DEFAULT_FILTERS.period ||
    filters.payment !== DEFAULT_FILTERS.payment;

  const expenseWord = filtered.length === 1 ? "expense" : "expenses";

  return (
    <div className="p-8">
      <div className="rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <SearchInput
            value={filters.search}
            onChange={(v) => setFilters({ ...filters, search: v })}
            placeholder="Search notes, categories, amounts..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={filters.category}
              options={categoryOptions}
              onChange={(id) => setFilters({ ...filters, category: id })}
            />
            <FilterDropdown
              value={filters.period}
              options={periodOptions}
              onChange={(id) => setFilters({ ...filters, period: id })}
            />
            <FilterDropdown
              value={filters.payment}
              options={PAYMENT_OPTIONS}
              onChange={(id) => setFilters({ ...filters, payment: id })}
            />
            {isFiltered && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-sm text-accent hover:underline"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setCurrentPage("trash")}
              className="inline-flex items-center gap-1.5 rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Trash
              {trashCount > 0 && (
                <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-neutral-600">
                  {trashCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="border-b border-neutral-100 px-6 py-3 text-sm text-neutral-500 dark:border-neutral-800">
          Showing{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{filtered.length}</span>{" "}
          {expenseWord} · Total{" "}
          <span className="font-medium text-neutral-900 dark:text-neutral-50">
            {formatMinor(total, baseCurrency)}
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">No expenses match your filters.</div>
        ) : (
          <div>
            {groups.map((group) => (
              <section key={group.date}>
                <header className="sticky top-0 z-10 flex items-center justify-between bg-neutral-50 px-6 py-2 text-xs dark:bg-neutral-900/80">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {formatDate(group.date, "dddd, MMM D")}
                  </span>
                  <span className="tabular-nums text-neutral-500">
                    {formatMinor(group.total, baseCurrency)}
                  </span>
                </header>
                <ul>
                  {group.items.map((e) => (
                    <ExpenseListItem key={e.id} expense={e} baseCurrency={baseCurrency} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative w-full max-w-md">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-neutral-400">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-control border border-neutral-200 bg-white py-2 ps-9 pe-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:placeholder:text-neutral-500"
      />
    </div>
  );
}

interface Filters {
  search: string;
  category: string;
  period: string;
  payment: string;
}

function filterExpenses(
  items: Expense[],
  filters: Filters,
  categories: { id: string; name: string }[],
): Expense[] {
  const search = filters.search.trim().toLowerCase();
  const { start, end } = periodRange(filters.period as PeriodId);

  return items
    .filter((e) => !e.deleted_at)
    .filter((e) => {
      if (filters.category !== "all" && e.category_id !== filters.category) return false;
      if (filters.payment !== "all" && e.payment_method !== filters.payment) return false;
      const d = dayjs(e.date);
      if (start && d.isBefore(start)) return false;
      if (end && d.isAfter(end)) return false;
      if (search) {
        const cat = categories.find((c) => c.id === e.category_id);
        const haystack = [
          e.note ?? "",
          cat?.name ?? "",
          e.payment_method ?? "",
          String(e.amount_minor / 100),
          e.currency_code,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

interface DayGroup {
  date: string;
  total: number;
  items: Expense[];
}

function groupByDay(items: Expense[], baseCurrency: string, fxRates: FxRate[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const { amountMinor, ok } = amountInBase(item, baseCurrency, fxRates);
    const add = ok ? amountMinor : 0;
    const group = map.get(item.date);
    if (group) {
      group.items.push(item);
      group.total += add;
    } else {
      map.set(item.date, { date: item.date, total: add, items: [item] });
    }
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
