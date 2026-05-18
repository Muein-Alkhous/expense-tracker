// Money helpers: minor-unit arithmetic and locale-aware formatting (see spec 9.14).

const MINOR_UNITS_PER_MAJOR: Record<string, number> = {
  USD: 100, EUR: 100, GBP: 100, AED: 100, JPY: 1, KWD: 1000,
};

export function minorPerMajor(currencyCode: string): number {
  return MINOR_UNITS_PER_MAJOR[currencyCode] ?? 100;
}

export function toMajor(amountMinor: number, currencyCode: string): number {
  return amountMinor / minorPerMajor(currencyCode);
}

export function toMinor(amountMajor: number, currencyCode: string): number {
  return Math.round(amountMajor * minorPerMajor(currencyCode));
}

export function formatMinor(amountMinor: number, currencyCode: string, locale = "en-US"): string {
  const value = toMajor(amountMinor, currencyCode);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

export function sumMinor(amounts: number[]): number {
  return amounts.reduce((acc, n) => acc + n, 0);
}
