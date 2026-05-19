// Parses quick-add text like "50 food lunch" into expense fields.

import dayjs from "dayjs";
import { today, daysAgo } from "@/lib/date";

export interface ParsedQuickAdd {
  amount?: string;
  note?: string;
  date?: string;
}

const DATE_WORDS: Record<string, () => string> = {
  today: today,
  yesterday: () => daysAgo(1),
};

export function parseQuickAddText(input: string): ParsedQuickAdd {
  const text = input.trim();
  if (!text) return {};

  const result: ParsedQuickAdd = {};
  let rest = text;

  const amountMatch = rest.match(/^(\d+(?:\.\d{1,2})?)\s*/);
  if (amountMatch) {
    result.amount = amountMatch[1];
    rest = rest.slice(amountMatch[0].length).trim();
  }

  const lower = rest.toLowerCase();
  for (const [word, fn] of Object.entries(DATE_WORDS)) {
    if (lower === word || lower.startsWith(`${word} `)) {
      result.date = fn();
      rest = rest.slice(word.length).trim();
      break;
    }
  }

  const isoMatch = rest.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    result.date = isoMatch[1];
    rest = rest.replace(isoMatch[0], "").trim();
  }

  const slashDate = rest.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (slashDate) {
    const parsed = dayjs(slashDate[1], "M/D/YYYY", true);
    if (parsed.isValid()) {
      result.date = parsed.format("YYYY-MM-DD");
      rest = rest.replace(slashDate[0], "").trim();
    }
  }

  if (rest) result.note = rest;
  return result;
}
