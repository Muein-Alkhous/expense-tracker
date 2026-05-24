// Shared period filter ids, labels, and date-range helpers.

import dayjs, { type Dayjs } from "dayjs";

export type PeriodId =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "all_time";

export const PERIOD_IDS: PeriodId[] = [
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "all_time",
];

const PERIOD_LABELS: Record<PeriodId, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
  all_time: "All time",
};

const SPENT_LABELS: Record<PeriodId, string> = {
  this_month: "Spent this month",
  last_month: "Spent last month",
  last_3_months: "Spent (last 3 months)",
  this_year: "Spent this year",
  all_time: "Total spent",
};

export const PERIOD_OPTIONS = PERIOD_IDS.map((id) => ({
  id,
  label: PERIOD_LABELS[id],
}));

export function periodLabel(period: PeriodId): string {
  return PERIOD_LABELS[period];
}

export function periodRange(period: PeriodId): {
  start: Dayjs | null;
  end: Dayjs | null;
} {
  const now = dayjs();
  switch (period) {
    case "this_month":
      return { start: now.startOf("month"), end: now.endOf("month") };
    case "last_month": {
      const prev = now.subtract(1, "month");
      return { start: prev.startOf("month"), end: prev.endOf("month") };
    }
    case "last_3_months":
      return {
        start: now.subtract(3, "month").startOf("month"),
        end: now.endOf("month"),
      };
    case "this_year":
      return { start: now.startOf("year"), end: now.endOf("year") };
    case "all_time":
    default:
      return { start: null, end: null };
  }
}

/** Calendar range immediately before `period` (for comparisons). */
export function previousPeriodRange(period: PeriodId): {
  start: Dayjs;
  end: Dayjs;
} | null {
  const now = dayjs();
  switch (period) {
    case "this_month": {
      const prev = now.subtract(1, "month");
      return { start: prev.startOf("month"), end: prev.endOf("month") };
    }
    case "last_month": {
      const prev = now.subtract(2, "month");
      return { start: prev.startOf("month"), end: prev.endOf("month") };
    }
    case "last_3_months": {
      const end = now.subtract(3, "month").endOf("month");
      const start = now.subtract(6, "month").startOf("month");
      return { start, end };
    }
    case "this_year": {
      const prev = now.subtract(1, "year");
      return { start: prev.startOf("year"), end: prev.endOf("year") };
    }
    default:
      return null;
  }
}

export function filterByPeriod<T extends { date: string }>(
  items: T[],
  period: PeriodId,
): T[] {
  const { start, end } = periodRange(period);
  if (!start || !end) return [...items];

  return items.filter((e) => {
    const d = dayjs(e.date);
    if (d.isBefore(start, "day")) return false;
    if (d.isAfter(end, "day")) return false;
    return true;
  });
}

export function filterByRange<T extends { date: string }>(
  items: T[],
  start: Dayjs,
  end: Dayjs,
): T[] {
  return items.filter((e) => {
    const d = dayjs(e.date);
    if (d.isBefore(start, "day")) return false;
    if (d.isAfter(end, "day")) return false;
    return true;
  });
}

export function periodSpentLabel(period: PeriodId): string {
  return SPENT_LABELS[period] ?? "Spent";
}

export function periodPrintLabel(period: PeriodId): string {
  const { start, end } = periodRange(period);
  if (start && end && start.isSame(end, "month")) {
    return start.format("MMMM YYYY");
  }
  if (start && end) {
    return `${start.format("MMM YYYY")} – ${end.format("MMM YYYY")}`;
  }
  return "All time";
}

export function previousPeriodPrintLabel(period: PeriodId): string | null {
  const prev = previousPeriodRange(period);
  if (!prev) return null;
  if (prev.start.isSame(prev.end, "month")) {
    return prev.start.format("MMMM YYYY");
  }
  return `${prev.start.format("MMM YYYY")} – ${prev.end.format("MMM YYYY")}`;
}
