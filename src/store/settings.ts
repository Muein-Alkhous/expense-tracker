// Settings store: theme, language, base currency, week start (see spec 11.5).

import { create } from "zustand";

interface SettingsState {
  theme: "light" | "dark" | "system";
  language: string;
  baseCurrency: string;
  weekStartDay: number;
}

export const useSettings = create<SettingsState>(() => ({
  theme: "system",
  language: "en",
  baseCurrency: "USD",
  weekStartDay: 1,
}));
