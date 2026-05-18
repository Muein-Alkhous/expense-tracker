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

export function isThisMonth(date: string): boolean {
  const now = dayjs();
  return dayjs(date).isSame(now, "month");
}

export function isThisWeek(date: string, weekStartDay = 1): boolean {
  const now = dayjs();
  const start = now.startOf("week").add(weekStartDay, "day");
  const end = start.add(7, "day");
  const d = dayjs(date);
  return (d.isSame(start) || d.isAfter(start)) && d.isBefore(end);
}
