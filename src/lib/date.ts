// Date helpers built on Day.js, including configurable week-start (see spec 9.15).

import dayjs from "dayjs";

export function today(): string {
  return dayjs().format("YYYY-MM-DD");
}

export function daysAgo(n: number): string {
  return dayjs().subtract(n, "day").format("YYYY-MM-DD");
}

export function formatDate(date: string, fmt = "MMM D, YYYY"): string {
  return dayjs(date).format(fmt);
}

/** Stable YYYY-MM-DD key for grouping/filtering (handles ISO datetimes). */
export function toDateKey(date: string): string {
  return dayjs(date).format("YYYY-MM-DD");
}

/** Short label for chart axes (e.g. "Apr 7"). */
export function formatChartDate(date: string): string {
  const d = dayjs(date);
  return d.isValid() ? d.format("MMM D") : date;
}

export function isThisMonth(date: string): boolean {
  const now = dayjs();
  return dayjs(date).isSame(now, "month");
}

function startOfCustomWeek(d: dayjs.Dayjs, weekStartDay: number): dayjs.Dayjs {
  const diff = (d.day() - weekStartDay + 7) % 7;
  return d.subtract(diff, "day").startOf("day");
}

export function isThisWeek(date: string, weekStartDay = 1): boolean {
  const d = dayjs(date);
  const now = dayjs();
  const start = startOfCustomWeek(now, weekStartDay);
  const end = start.add(7, "day");
  return !d.isBefore(start) && d.isBefore(end);
}
