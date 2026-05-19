// Shared period filter ids, labels, and date-range helpers.

import dayjs, { type Dayjs } from "dayjs";

export type PeriodId =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "all_time";

export const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_year", label: "This year" },
  { id: "all_time", label: "All time" },
];

export function periodLabel(period: PeriodId): string {
  return PERIOD_OPTIONS.find((o) => o.id === period)?.label ?? "This month";
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
  switch (period) {
    case "this_month":
      return "Spent this month";
    case "last_month":
      return "Spent last month";
    case "last_3_months":
      return "Spent (last 3 months)";
    case "this_year":
      return "Spent this year";
    case "all_time":
      return "Total spent";
    default:
      return "Spent";
  }
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
