// Load SQLite data on startup and migrate legacy localStorage once.

import { buildBackupPayload, type AppBackupPayload } from "@/lib/backup";
import { api } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import { useBudgets } from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import type { CategoryBudget } from "@/store/budgets";
import type { Category, Expense } from "@/types";
import type { FxRate } from "@/types/fx";

function buildSeedPayload(): AppBackupPayload {
  const categories: Category[] = [
    { id: "food", name: "Food", color: "#ef4444", icon: "utensils", is_active: true, created_at: "", updated_at: "" },
    { id: "transport", name: "Transport", color: "#f97316", icon: "car", is_active: true, created_at: "", updated_at: "" },
    { id: "bills", name: "Bills", color: "#3b82f6", icon: "receipt", is_active: true, created_at: "", updated_at: "" },
    { id: "shopping", name: "Shopping", color: "#a855f7", icon: "shopping-bag", is_active: true, created_at: "", updated_at: "" },
    { id: "entertainment", name: "Entertainment", color: "#ec4899", icon: "film", is_active: true, created_at: "", updated_at: "" },
    { id: "health", name: "Health", color: "#22c55e", icon: "heart", is_active: true, created_at: "", updated_at: "" },
    { id: "education", name: "Education", color: "#14b8a6", icon: "book", is_active: true, created_at: "", updated_at: "" },
    { id: "rent", name: "Rent", color: "#64748b", icon: "home", is_active: true, created_at: "", updated_at: "" },
    { id: "savings", name: "Savings", color: "#10b981", icon: "piggy-bank", is_active: true, created_at: "", updated_at: "" },
    { id: "other", name: "Other", color: "#737373", icon: "more-horizontal", is_active: true, created_at: "", updated_at: "" },
  ];

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const expenses: Expense[] = [
    { id: "1", amount_minor: 4250, currency_code: "USD", category_id: "food", date: daysAgo(0), note: "Sushi dinner", payment_method: "card", is_recurring: false, created_at: "", updated_at: "" },
    { id: "2", amount_minor: 1200, currency_code: "USD", category_id: "transport", date: daysAgo(0), note: "Gas station", payment_method: "cash", is_recurring: false, created_at: "", updated_at: "" },
    { id: "3", amount_minor: 11000, currency_code: "USD", category_id: "bills", date: daysAgo(1), note: "Internet fiber", payment_method: "bank", is_recurring: true, created_at: "", updated_at: "" },
  ];

  const s = useSettings.getState();
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    expenses,
    categories,
    budgets: {
      totalMonthlyMinor: 50000,
      items: [
        { categoryId: "food", limitMinor: 10000 },
        { categoryId: "transport", limitMinor: 6000 },
      ],
    },
    fx_rates: [],
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
      language: (settingsState?.language as string) ?? s.language,
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

  let counts = await api.dbCounts();
  if (counts.expenses === 0 && counts.categories === 0) {
    const legacy = buildPayloadFromLocalStorage();
    if (legacy) {
      await api.importBackup(legacy);
      clearLegacyLocalStorage();
    } else {
      await api.importBackup(buildSeedPayload());
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
  const json = JSON.stringify(payload, null, 2);
  const path = await api.saveBackupToDisk(s.backupPath, json);
  s.setLastBackupAt(new Date().toISOString());
  return path;
}
