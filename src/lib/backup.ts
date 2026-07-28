// Full-app backup and restore (JSON download / file upload).

import dayjs from "dayjs";
import { api } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import { useBudgets, type CategoryBudget } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useFxRates } from "@/store/fxRates";
import { useSettings, type BackupRecord, type ThemeMode } from "@/store/settings";
import type { Category, Expense } from "@/types";
import type { FxRate } from "@/types/fx";
import type { PageId } from "@/store/ui";

const BACKUP_VERSION = 2;

export interface AppBackupPayload {
  version: number;
  exported_at: string;
  expenses: Expense[];
  categories: Category[];
  budgets: {
    totalMonthlyMinor: number;
    items: CategoryBudget[];
  };
  fx_rates?: FxRate[];
  settings: {
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
  };
}

export function formatSize(bytes: number): string {
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
    fx_rates: useFxRates.getState().rates,
    settings: {
      theme: s.theme,
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

export function serializeBackupPayload(
  payload: AppBackupPayload,
  encrypt: boolean,
  password?: string,
): { content: string; extension: string } {
  if (encrypt) {
    throw new Error(
      "Encrypted backups require the desktop application. Browser JSON exports are unencrypted.",
    );
  }
  let content = JSON.stringify(payload, null, 2);
  let extension = "json";
  void password;

  return { content, extension };
}

function backupFilename(extension: string): string {
  const stamp = dayjs().format("YYYY-MM-DD_HHmm");
  return `expense_tracker_backup_${stamp}.${extension}`;
}

function makeBackupRecord(content: string, extension: string, encrypted: boolean): BackupRecord {
  const name = backupFilename(extension);
  return {
    id: crypto.randomUUID(),
    name,
    date: dayjs().format("MMM D, YYYY · h:mm A"),
    size: formatSize(new TextEncoder().encode(content).length),
    encrypted,
  };
}

/** Browser / Vite dev: trigger download to the system Downloads folder. */
export function downloadBackupFile(
  payload: AppBackupPayload,
  encrypt: boolean,
  password?: string,
): void {
  const { content, extension } = serializeBackupPayload(payload, encrypt, password);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFilename(extension);
  link.click();
  URL.revokeObjectURL(url);
  useSettings.getState().addBackupRecord(makeBackupRecord(content, extension, encrypt));
}

/** Desktop app: write backup only to the configured folder (no browser download). */
export async function saveBackupToConfiguredFolder(
  backupPath: string,
  payload: AppBackupPayload,
  encrypt: boolean,
  password?: string,
  backupKind: "manual" | "automatic" = "manual",
): Promise<string> {
  if (isTauri()) {
    const result = await api.createEtbackup(
      backupPath,
      encrypt ? password : undefined,
      backupKind,
    );
    return result.path;
  }
  const { content, extension } = serializeBackupPayload(payload, encrypt, password);
  useSettings.getState().addBackupRecord(makeBackupRecord(content, extension, encrypt));
  throw new Error(
    "Saving to a configured folder is only available in the desktop application.",
  );
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
  if (isTauri()) {
    await api.importBackup(payload);
    await reloadDesktopData();
  } else {
    useExpenses.getState().replaceAll(payload.expenses);
    useCategories.getState().replaceAll(payload.categories);
    useBudgets.getState().replaceAll(payload.budgets);
    if (payload.fx_rates?.length) {
      useFxRates.getState().replaceAll(payload.fx_rates);
    }
  }

  const s = payload.settings;
  const settings = useSettings.getState();
  settings.setTheme(s.theme);
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

export async function reloadDesktopData(): Promise<void> {
  await Promise.all([
    useExpenses.getState().loadFromDb(),
    useCategories.getState().loadFromDb(),
    useBudgets.getState().loadFromDb(),
    useFxRates.getState().loadFromDb(),
  ]);
}
