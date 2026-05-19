// Settings store: theme, language, currency, backup prefs (see spec 11.5).

import { create } from "zustand";
import type { PageId } from "@/store/ui";

export type ThemeMode = "light" | "dark" | "system";
export type SettingsSection =
  | "general"
  | "appearance"
  | "currency"
  | "backup"
  | "notifications"
  | "about";

interface SettingsState {
  theme: ThemeMode;
  language: string;
  baseCurrency: string;
  weekStartDay: number;
  defaultView: PageId;
  quickAddParser: boolean;
  accentColor: string;
  backupPath: string;
  autoBackup: boolean;
  backupFrequency: "daily" | "weekly" | "monthly";
  encryptBackups: boolean;
  budgetAlerts: boolean;
  weeklyDigest: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: string) => void;
  setBaseCurrency: (code: string) => void;
  setWeekStartDay: (day: number) => void;
  setDefaultView: (view: PageId) => void;
  setQuickAddParser: (on: boolean) => void;
  setAccentColor: (color: string) => void;
  setBackupPath: (path: string) => void;
  setAutoBackup: (on: boolean) => void;
  setBackupFrequency: (freq: "daily" | "weekly" | "monthly") => void;
  setEncryptBackups: (on: boolean) => void;
  setBudgetAlerts: (on: boolean) => void;
  setWeeklyDigest: (on: boolean) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  theme: "light",
  language: "en",
  baseCurrency: "USD",
  weekStartDay: 1,
  defaultView: "dashboard",
  quickAddParser: true,
  accentColor: "#6366f1",
  backupPath: "~/Documents/ExpenseTracker/Backups",
  autoBackup: true,
  backupFrequency: "daily",
  encryptBackups: false,
  budgetAlerts: true,
  weeklyDigest: false,
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
  setWeekStartDay: (weekStartDay) => set({ weekStartDay }),
  setDefaultView: (defaultView) => set({ defaultView }),
  setQuickAddParser: (quickAddParser) => set({ quickAddParser }),
  setAccentColor: (accentColor) => set({ accentColor }),
  setBackupPath: (backupPath) => set({ backupPath }),
  setAutoBackup: (autoBackup) => set({ autoBackup }),
  setBackupFrequency: (backupFrequency) => set({ backupFrequency }),
  setEncryptBackups: (encryptBackups) => set({ encryptBackups }),
  setBudgetAlerts: (budgetAlerts) => set({ budgetAlerts }),
  setWeeklyDigest: (weeklyDigest) => set({ weeklyDigest }),
}));

export const ACCENT_SWATCHES = [
  "#6366f1",
  "#14b8a6",
  "#ec4899",
  "#f97316",
  "#0ea5e9",
] as const;

export const MOCK_BACKUPS = [
  { name: "expense_tracker_backup_2026-05-18.json", date: "May 18, 2026", size: "1.1 MB" },
  { name: "expense_tracker_backup_2026-05-11.json", date: "May 11, 2026", size: "1.0 MB" },
  { name: "expense_tracker_backup_2026-05-04.json", date: "May 4, 2026", size: "980 KB" },
] as const;
