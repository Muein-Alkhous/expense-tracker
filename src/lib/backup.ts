// Full-app backup and restore (JSON download / file upload).

import dayjs from "dayjs";
import { useBudgets, type CategoryBudget } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useSettings, type BackupRecord, type ThemeMode } from "@/store/settings";
import type { Category, Expense } from "@/types";
import type { PageId } from "@/store/ui";

const BACKUP_VERSION = 1;

export interface AppBackupPayload {
  version: number;
  exported_at: string;
  expenses: Expense[];
  categories: Category[];
  budgets: {
    totalMonthlyMinor: number;
    items: CategoryBudget[];
  };
  settings: {
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
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildBackupPayload(): AppBackupPayload {
  const s = useSettings.getState();
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    expenses: useExpenses.getState().items,
    categories: useCategories.getState().items,
    budgets: {
      totalMonthlyMinor: useBudgets.getState().totalMonthlyMinor,
      items: useBudgets.getState().items,
    },
    settings: {
      theme: s.theme,
      language: s.language,
      baseCurrency: s.baseCurrency,
      weekStartDay: s.weekStartDay,
      defaultView: s.defaultView,
      quickAddParser: s.quickAddParser,
      accentColor: s.accentColor,
      backupPath: s.backupPath,
      autoBackup: s.autoBackup,
      backupFrequency: s.backupFrequency,
      encryptBackups: s.encryptBackups,
      budgetAlerts: s.budgetAlerts,
      weeklyDigest: s.weeklyDigest,
    },
  };
}

export function downloadBackupFile(
  payload: AppBackupPayload,
  encrypt: boolean,
  password?: string,
): void {
  let content = JSON.stringify(payload, null, 2);
  let extension = "json";

  if (encrypt && password) {
    content = btoa(
      encodeURIComponent(content)
        .split("")
        .map((c, i) =>
          String.fromCharCode(c.charCodeAt(0) ^ password.charCodeAt(i % password.length)),
        )
        .join(""),
    );
    extension = "enc.json";
  }

  const bytes = new TextEncoder().encode(content).length;
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = dayjs().format("YYYY-MM-DD_HHmm");
  const filename = `expense_tracker_backup_${stamp}.${extension}`;
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  const record: BackupRecord = {
    id: crypto.randomUUID(),
    name: filename,
    date: dayjs().format("MMM D, YYYY · h:mm A"),
    size: formatSize(bytes),
    encrypted: encrypt,
  };
  useSettings.getState().addBackupRecord(record);
}

export function parseBackupFileContent(
  raw: string,
  encrypted: boolean,
  password?: string,
): AppBackupPayload {
  let json = raw;
  if (encrypted) {
    if (!password) throw new Error("Password required to restore this backup.");
    try {
      const decoded = atob(raw);
      json = decodeURIComponent(
        decoded
          .split("")
          .map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ password.charCodeAt(i % password.length)),
          )
          .join(""),
      );
    } catch {
      throw new Error("Could not decrypt backup. Check your password.");
    }
  }

  const data = JSON.parse(json) as AppBackupPayload;
  if (!data.version || !Array.isArray(data.expenses) || !Array.isArray(data.categories)) {
    throw new Error("Invalid backup file format.");
  }
  return data;
}

export async function restoreBackupPayload(payload: AppBackupPayload): Promise<void> {
  useExpenses.getState().replaceAll(payload.expenses);
  useCategories.getState().replaceAll(payload.categories);
  useBudgets.getState().replaceAll(payload.budgets);

  const s = payload.settings;
  const settings = useSettings.getState();
  settings.setTheme(s.theme);
  await settings.setLanguage(s.language);
  settings.setBaseCurrency(s.baseCurrency);
  settings.setWeekStartDay(s.weekStartDay);
  settings.setDefaultView(s.defaultView);
  settings.setQuickAddParser(s.quickAddParser);
  settings.setAccentColor(s.accentColor);
  settings.setBackupPath(s.backupPath);
  settings.setAutoBackup(s.autoBackup);
  settings.setBackupFrequency(s.backupFrequency);
  settings.setEncryptBackups(s.encryptBackups);
  settings.setBudgetAlerts(s.budgetAlerts);
  settings.setWeeklyDigest(s.weeklyDigest);
}
