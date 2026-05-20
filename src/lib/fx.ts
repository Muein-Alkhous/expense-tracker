// FX lookup and conversion (spec §9.14).

import { toDateKey } from "@/lib/date";
import { toMajor, toMinor } from "@/lib/money";
import type { FxRate } from "@/types/fx";

const CROSS_HUBS = ["USD", "EUR", "GBP"] as const;

export interface ConversionResult {
  amountMinor: number;
  ok: boolean;
  rate?: number;
}

/** Find rate: units of `to` per 1 unit of `from`, effective on or before `date`. */
export function findFxRate(
  rates: FxRate[],
  from: string,
  to: string,
  date: string,
  allowCross = true,
): number | null {
  if (from === to) return 1;

  const dateKey = toDateKey(date);
  let bestDirect: FxRate | null = null;
  let bestInverse: FxRate | null = null;

  for (const r of rates) {
    if (r.as_of_date > dateKey) continue;
    if (r.from_code === from && r.to_code === to) {
      if (!bestDirect || r.as_of_date > bestDirect.as_of_date) bestDirect = r;
    }
    if (r.from_code === to && r.to_code === from) {
      if (!bestInverse || r.as_of_date > bestInverse.as_of_date) bestInverse = r;
    }
  }

  if (bestDirect) return bestDirect.rate;
  if (bestInverse && bestInverse.rate !== 0) return 1 / bestInverse.rate;

  if (!allowCross) return null;

  for (const hub of CROSS_HUBS) {
    if (hub === from || hub === to) continue;
    const leg1 = findFxRate(rates, from, hub, dateKey, false);
    const leg2 = findFxRate(rates, hub, to, dateKey, false);
    if (leg1 != null && leg2 != null) return leg1 * leg2;
  }

  return null;
}

export function convertMinor(
  amountMinor: number,
  fromCode: string,
  toCode: string,
  asOfDate: string,
  rates: FxRate[],
): ConversionResult {
  if (fromCode === toCode) {
    return { amountMinor, ok: true, rate: 1 };
  }

  const rate = findFxRate(rates, fromCode, toCode, asOfDate);
  if (rate == null || rate <= 0) {
    return { amountMinor: 0, ok: false };
  }

  const major = toMajor(amountMinor, fromCode);
  const converted = toMinor(major * rate, toCode);
  return { amountMinor: converted, ok: true, rate };
}

/** Format for UI: 1 EUR = 1.08 USD */
export function formatRatePair(from: string, to: string, rate: number): string {
  const decimals = rate >= 100 ? 2 : rate >= 1 ? 4 : 6;
  return `1 ${from} = ${rate.toFixed(decimals)} ${to}`;
}

export function parseFxCsv(text: string): Omit<FxRate, "id">[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("from") && header.includes("to") && header.includes("rate");
  const rows = hasHeader ? lines.slice(1) : lines;

  const out: Omit<FxRate, "id">[] = [];
  for (const line of rows) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [from_code, to_code, rateStr, dateStr] = parts;
    const rate = Number(rateStr);
    if (!from_code || !to_code || !Number.isFinite(rate) || rate <= 0) continue;
    out.push({
      from_code: from_code.toUpperCase(),
      to_code: to_code.toUpperCase(),
      rate,
      as_of_date: dateStr ? toDateKey(dateStr) : toDateKey(new Date().toISOString()),
    });
  }
  return out;
}

export function buildSeedRates(asOfDate: string): Omit<FxRate, "id">[] {
  // Approximate majors; user can refresh via API or edit manually.
  const usdEur = 0.92;
  const usdGbp = 0.79;
  const usdTry = 32.5;
  const usdSyp = 13000;

  const pairs: [string, string, number][] = [
    ["USD", "EUR", usdEur],
    ["EUR", "USD", 1 / usdEur],
    ["USD", "GBP", usdGbp],
    ["GBP", "USD", 1 / usdGbp],
    ["USD", "TRY", usdTry],
    ["TRY", "USD", 1 / usdTry],
    ["USD", "SYP", usdSyp],
    ["SYP", "USD", 1 / usdSyp],
    ["EUR", "GBP", usdGbp / usdEur],
    ["GBP", "EUR", usdEur / usdGbp],
  ];

  return pairs.map(([from_code, to_code, rate]) => ({
    from_code,
    to_code,
    rate,
    as_of_date: asOfDate,
  }));
}

/** Frankfurter (ECB) — optional user-triggered refresh; SYP may be unavailable. */
export async function fetchRatesFromApi(
  baseCurrency: string,
  targets: string[],
): Promise<Omit<FxRate, "id">[]> {
  const symbols = targets.filter((c) => c !== baseCurrency);
  if (symbols.length === 0) return [];

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(symbols.join(","))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch exchange rates. Check your connection.");

  const data = (await res.json()) as {
    date: string;
    rates: Record<string, number>;
  };

  const as_of_date = data.date;
  const out: Omit<FxRate, "id">[] = [];

  for (const [to_code, rate] of Object.entries(data.rates)) {
    if (!Number.isFinite(rate) || rate <= 0) continue;
    out.push({ from_code: baseCurrency, to_code, rate, as_of_date });
    out.push({
      from_code: to_code,
      to_code: baseCurrency,
      rate: 1 / rate,
      as_of_date,
    });
  }

  return out;
}
