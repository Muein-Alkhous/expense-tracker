// Typed Tauri command wrappers for SQLite-backed persistence.

import { invoke } from "@tauri-apps/api/core";
import type { CategoryBudget } from "@/store/budgets";
import type { Category, Expense, PaymentMethod } from "@/types";
import type { FxRate } from "@/types/fx";
import type { AppBackupPayload } from "@/lib/backup";

export interface NewExpenseInput {
  amount_minor: number;
  currency_code: string;
  category_id: string;
  date: string;
  note?: string;
  payment_method?: PaymentMethod;
  tags?: string[];
}

export interface DbCounts {
  expenses: number;
  categories: number;
}

export interface BudgetsSnapshot {
  totalMonthlyMinor: number;
  items: CategoryBudget[];
}

export interface RecurringRule {
  id: string;
  title: string;
  amount_minor: number;
  currency_code: string;
  category_id: string;
  frequency: string;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  last_generated_date?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface BackupFileInfo {
  name: string;
  path: string;
  size_bytes: number;
  modified_at: string;
  encrypted: boolean;
}

export interface NewRecurringRuleInput {
  title: string;
  amount_minor: number;
  currency_code: string;
  category_id: string;
  frequency: string;
  start_date: string;
  end_date?: string;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export const api = {
  dbCounts: () => call<DbCounts>("db_counts"),
  listExpenses: () => call<Expense[]>("list_expenses"),
  createExpense: (input: NewExpenseInput) => call<Expense>("create_expense", { input }),
  updateExpense: (id: string, input: NewExpenseInput) =>
    call<Expense>("update_expense", { id, input }),
  softDeleteExpense: (id: string) => call<void>("soft_delete_expense", { id }),
  restoreExpense: (id: string) => call<void>("restore_expense", { id }),
  permanentDeleteExpense: (id: string) => call<void>("permanent_delete_expense", { id }),
  emptyTrash: () => call<void>("empty_trash"),
  listCategories: () => call<Category[]>("list_categories"),
  createCategory: (input: { name: string; color: string; icon: string }) =>
    call<Category>("create_category", { input }),
  updateCategory: (
    id: string,
    name: string,
    color: string,
    icon: string,
    is_active: boolean,
  ) => call<Category>("update_category", { id, name, color, icon, is_active }),
  deleteCategory: (id: string) => call<void>("delete_category", { id }),
  getBudgets: () => call<BudgetsSnapshot>("get_budgets"),
  setBudgets: (snapshot: BudgetsSnapshot) => call<void>("set_budgets", { snapshot }),
  listFxRates: () => call<FxRate[]>("list_fx_rates"),
  upsertFxRate: (input: {
    from_code: string;
    to_code: string;
    rate: number;
    as_of_date: string;
  }) => call<FxRate>("upsert_fx_rate", { input }),
  removeFxRate: (id: string) => call<void>("remove_fx_rate", { id }),
  replaceFxRates: (rates: FxRate[]) => call<void>("replace_fx_rates", { rates }),
  listRecurringRules: () => call<RecurringRule[]>("list_recurring_rules"),
  createRecurringRule: (input: NewRecurringRuleInput) =>
    call<RecurringRule>("create_recurring_rule", { input }),
  deleteRecurringRule: (id: string) => call<void>("delete_recurring_rule", { id }),
  materializeRecurringDue: () =>
    call<{ created: number }>("materialize_recurring_due"),
  importBackup: (payload: AppBackupPayload) => call<void>("import_backup", { payload }),
  saveBackupToDisk: (backupPath: string, content: string, fileExtension = "json") =>
    call<string>("save_backup_to_disk", {
      backupPath,
      json: content,
      fileExtension,
    }),
  listBackups: (backupPath: string) => call<BackupFileInfo[]>("list_backups", { backupPath }),
  readBackupFile: (filePath: string) => call<string>("read_backup_file", { filePath }),
  getUiSettings: () => call<Record<string, unknown> | null>("get_ui_settings"),
  setUiSettings: (settings: Record<string, unknown>) =>
    call<void>("set_ui_settings", { settings }),
};
