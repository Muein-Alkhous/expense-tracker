// Load SQLite data on startup and migrate legacy localStorage once.

import {
  buildBackupPayload,
  restoreBackupPayload,
  saveBackupToConfiguredFolder,
  type AppBackupPayload,
} from "@/lib/backup";
import { api } from "@/lib/api";
import { hydrateSettingsFromDb } from "@/lib/settingsDb";
import { isTauri } from "@/lib/tauriEnv";
import { buildSeedPayload } from "@/lib/seedData";
import { useBudgets } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import type { CategoryBudget } from "@/store/budgets";
import type { Category, Expense } from "@/types";
import type { FxRate } from "@/types/fx";

function seedPayloadFromSettings(): AppBackupPayload {
  const s = useSettings.getState();
  return buildSeedPayload({
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
  });
}

const PERSIST_KEYS = [
  "expense-tracker-expenses",
  "expense-tracker-categories",
  "expense-tracker-budgets",
  "expense-tracker-fx-rates",
  "expense-tracker-settings",
] as const;

function readPersistedState<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: T };
    return parsed.state ?? (parsed as T);
  } catch {
    return null;
  }
}

function buildPayloadFromLocalStorage(): AppBackupPayload | null {
  const expensesState = readPersistedState<{ items: Expense[] }>("expense-tracker-expenses");
  const categoriesState = readPersistedState<{ items: Category[] }>("expense-tracker-categories");
  const budgetsState = readPersistedState<{
    totalMonthlyMinor: number;
    items: CategoryBudget[];
  }>("expense-tracker-budgets");
  const fxState = readPersistedState<{ rates: FxRate[] }>("expense-tracker-fx-rates");

  if (!expensesState?.items?.length && !categoriesState?.items?.length) {
    return null;
  }

  const settingsState = readPersistedState<Record<string, unknown>>("expense-tracker-settings");
  const s = useSettings.getState();

  return {
    version: 2,
    exported_at: new Date().toISOString(),
    expenses: expensesState?.items ?? [],
    categories: categoriesState?.items ?? [],
    budgets: budgetsState ?? { totalMonthlyMinor: 50000, items: [] },
    fx_rates: fxState?.rates ?? [],
    settings: {
      theme: (settingsState?.theme as typeof s.theme) ?? s.theme,
      baseCurrency: (settingsState?.baseCurrency as string) ?? s.baseCurrency,
      weekStartDay: (settingsState?.weekStartDay as number) ?? s.weekStartDay,
      defaultView: (settingsState?.defaultView as typeof s.defaultView) ?? s.defaultView,
      quickAddParser: (settingsState?.quickAddParser as boolean) ?? s.quickAddParser,
      accentColor: (settingsState?.accentColor as string) ?? s.accentColor,
      backupPath: (settingsState?.backupPath as string) ?? s.backupPath,
      autoBackup: (settingsState?.autoBackup as boolean) ?? s.autoBackup,
      backupFrequency: (settingsState?.backupFrequency as typeof s.backupFrequency) ?? s.backupFrequency,
      encryptBackups: (settingsState?.encryptBackups as boolean) ?? s.encryptBackups,
      budgetAlerts: (settingsState?.budgetAlerts as boolean) ?? s.budgetAlerts,
      weeklyDigest: (settingsState?.weeklyDigest as boolean) ?? s.weeklyDigest,
    },
  };
}

function clearLegacyLocalStorage(): void {
  for (const key of PERSIST_KEYS) {
    localStorage.removeItem(key);
  }
}

export async function bootstrapDatabase(): Promise<void> {
  if (!isTauri()) return;

  await hydrateSettingsFromDb();

  let counts = await api.dbCounts();
  if (counts.expenses === 0 && counts.categories === 0) {
    const legacy = buildPayloadFromLocalStorage();
    if (legacy) {
      await api.importBackup(legacy);
      clearLegacyLocalStorage();
    } else {
      await api.importBackup(seedPayloadFromSettings());
    }
    counts = await api.dbCounts();
  }

  await Promise.all([
    useExpenses.getState().loadFromDb(),
    useCategories.getState().loadFromDb(),
    useBudgets.getState().loadFromDb(),
    useFxRates.getState().loadFromDb(),
  ]);

  const materialized = await api.materializeRecurringDue();
  if (materialized.created > 0) {
    await useExpenses.getState().loadFromDb();
  }
}

/** Replace all app data with ~3 months of demo categories and expenses. */
export async function loadDemoData(): Promise<void> {
  const payload = seedPayloadFromSettings();
  await restoreBackupPayload(payload);
  if (isTauri()) {
    useFxRates.getState().seedDefaultsIfEmpty();
  }
}

export async function persistBudgetsToDb(): Promise<void> {
  if (!isTauri()) return;
  const { totalMonthlyMinor, items } = useBudgets.getState();
  await api.setBudgets({ totalMonthlyMinor, items });
}

export async function saveAutoBackupIfDue(): Promise<string | null> {
  if (!isTauri()) return null;
  const s = useSettings.getState();
  if (!s.autoBackup) return null;

  const now = Date.now();
  const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : 0;
  const dayMs = 86400000;
  const due =
    s.backupFrequency === "daily"
      ? now - last >= dayMs
      : s.backupFrequency === "weekly"
        ? now - last >= 7 * dayMs
        : now - last >= 30 * dayMs;

  if (last > 0 && !due) return null;
  const payload = buildBackupPayload();
  const path = await saveBackupToConfiguredFolder(
    s.backupPath,
    payload,
    false,
    undefined,
    "automatic",
  );
  s.setLastBackupAt(new Date().toISOString());
  return path;
}
