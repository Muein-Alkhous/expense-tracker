// Settings store with localStorage persistence (see spec 11.5).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PageId } from "@/store/ui";

export type ThemeMode = "light" | "dark" | "system";
export type SettingsSection =
  | "general"
  | "appearance"
  | "currency"
  | "backup"
  | "recurring"
  | "notifications"
  | "about";

export interface BackupRecord {
  id: string;
  name: string;
  date: string;
  size: string;
  encrypted: boolean;
}

interface SettingsData {
  theme: ThemeMode;
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
  backupHistory: BackupRecord[];
  lastBackupAt: string | null;
}

interface SettingsState extends SettingsData {
  setTheme: (theme: ThemeMode) => void;
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
  addBackupRecord: (record: BackupRecord) => void;
  setLastBackupAt: (iso: string | null) => void;
}

const initialData: SettingsData = {
  theme: "light",
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
  backupHistory: [],
  lastBackupAt: null,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialData,
      setTheme: (theme) => set({ theme }),
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
      addBackupRecord: (record) =>
        set((state) => ({
          backupHistory: [record, ...state.backupHistory].slice(0, 10),
        })),
      setLastBackupAt: (lastBackupAt) => set({ lastBackupAt }),
    }),
    {
      name: "expense-tracker-settings",
      partialize: (state) => {
        const {
          setTheme,
          setBaseCurrency,
          setWeekStartDay,
          setDefaultView,
          setQuickAddParser,
          setAccentColor,
          setBackupPath,
          setAutoBackup,
          setBackupFrequency,
          setEncryptBackups,
          setBudgetAlerts,
          setWeeklyDigest,
          addBackupRecord,
          setLastBackupAt,
          ...data
        } = state;
        void setTheme;
        void setBaseCurrency;
        void setWeekStartDay;
        void setDefaultView;
        void setQuickAddParser;
        void setAccentColor;
        void setBackupPath;
        void setAutoBackup;
        void setBackupFrequency;
        void setEncryptBackups;
        void setBudgetAlerts;
        void setWeeklyDigest;
        void addBackupRecord;
        void setLastBackupAt;
        return data;
      },
    },
  ),
);

export const ACCENT_SWATCHES = [
  "#6366f1",
  "#14b8a6",
  "#ec4899",
  "#f97316",
  "#0ea5e9",
] as const;
