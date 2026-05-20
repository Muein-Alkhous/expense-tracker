// Supported ISO 4217 currency codes in the app.

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "TRY", "SYP"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}
