// Expenses screen: searchable, filterable transaction list grouped by day.

import { useMemo, useState } from "react";
import FilterDropdown, { type FilterOption } from "@/components/FilterDropdown";
import ExpenseListItem from "@/components/ExpenseListItem";
import { CATEGORIES, useExpenses } from "@/store/expenses";
import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import dayjs from "dayjs";
import type { Expense } from "@/types";

const BASE_CURRENCY = "USD";

const CATEGORY_OPTIONS: FilterOption[] = [
  { id: "all", label: "All categories" },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.name })),
];

const PERIOD_OPTIONS: FilterOption[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_year", label: "This year" },
  { id: "all_time", label: "All time" },
];

const PAYMENT_OPTIONS: FilterOption[] = [
  { id: "all", label: "All payment methods" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

const DEFAULT_FILTERS = {
  search: "",
  category: "all",
  period: "this_month",
  payment: "all",
};

export default function Expenses() {
  const items = useExpenses((s) => s.items);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const filtered = useMemo(() => filterExpenses(items, filters), [items, filters]);

  const total = useMemo(
    () => filtered.reduce((acc, e) => acc + e.amount_minor, 0),
    [filtered],
  );

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const isFiltered =
    filters.search !== DEFAULT_FILTERS.search ||
    filters.category !== DEFAULT_FILTERS.category ||
    filters.period !== DEFAULT_FILTERS.period ||
    filters.payment !== DEFAULT_FILTERS.payment;

  return (
    <div className="p-8">
      <div className="rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <SearchInput value={filters.search} onChange={(v) => setFilters({ ...filters, search: v })} />
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={filters.category}
              options={CATEGORY_OPTIONS}
              onChange={(id) => setFilters({ ...filters, category: id })}
            />
            <FilterDropdown
              value={filters.period}
              options={PERIOD_OPTIONS}
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
          </div>
        </div>

        <div className="border-b border-neutral-100 px-6 py-3 text-sm text-neutral-500 dark:border-neutral-800">
          Showing <span className="font-medium text-neutral-700 dark:text-neutral-300">{filtered.length}</span>{" "}
          {filtered.length === 1 ? "expense" : "expenses"} ·{" "}
          Total <span className="font-medium text-neutral-900 dark:text-neutral-50">{formatMinor(total, BASE_CURRENCY)}</span>
        </div>

        {groups.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            No expenses match your filters.
          </div>
        ) : (
          <div>
            {groups.map((group) => (
              <section key={group.date}>
                <header className="sticky top-0 z-10 flex items-center justify-between bg-neutral-50 px-6 py-2 text-xs dark:bg-neutral-900/80">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {formatDate(group.date, "dddd, MMM D")}
                  </span>
                  <span className="tabular-nums text-neutral-500">
                    {formatMinor(group.total, BASE_CURRENCY)}
                  </span>
                </header>
                <ul>
                  {group.items.map((e) => (
                    <ExpenseListItem key={e.id} expense={e} baseCurrency={BASE_CURRENCY} />
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
}

function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="relative w-full max-w-md">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search notes, categories, amounts..."
        className="w-full rounded-control border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:placeholder:text-neutral-500"
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

function filterExpenses(items: Expense[], filters: Filters): Expense[] {
  const search = filters.search.trim().toLowerCase();
  const { start, end } = periodRange(filters.period);

  return items
    .filter((e) => !e.deleted_at)
    .filter((e) => {
      if (filters.category !== "all" && e.category_id !== filters.category) return false;
      if (filters.payment !== "all" && e.payment_method !== filters.payment) return false;
      const d = dayjs(e.date);
      if (start && d.isBefore(start)) return false;
      if (end && d.isAfter(end)) return false;
      if (search) {
        const cat = CATEGORIES.find((c) => c.id === e.category_id);
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

function periodRange(period: string): { start: dayjs.Dayjs | null; end: dayjs.Dayjs | null } {
  const now = dayjs();
  switch (period) {
    case "this_month":
      return { start: now.startOf("month"), end: now.endOf("month") };
    case "last_month": {
      const prev = now.subtract(1, "month");
      return { start: prev.startOf("month"), end: prev.endOf("month") };
    }
    case "last_3_months":
      return { start: now.subtract(3, "month").startOf("month"), end: now.endOf("month") };
    case "this_year":
      return { start: now.startOf("year"), end: now.endOf("year") };
    case "all_time":
    default:
      return { start: null, end: null };
  }
}

interface DayGroup {
  date: string;
  total: number;
  items: Expense[];
}

function groupByDay(items: Expense[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const group = map.get(item.date);
    if (group) {
      group.items.push(item);
      group.total += item.amount_minor;
    } else {
      map.set(item.date, { date: item.date, total: item.amount_minor, items: [item] });
    }
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
