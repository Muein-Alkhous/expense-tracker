// Persist UI settings in SQLite when running inside Tauri.

import { api } from "@/lib/api";
import type { AppBackupPayload } from "@/lib/backup";
import { isTauri } from "@/lib/tauriEnv";
import { useSettings } from "@/store/settings";
import type { PageId } from "@/store/ui";

export type StoredUiSettings = AppBackupPayload["settings"] & {
  lastBackupAt?: string | null;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let skipNextPersist = false;

export function settingsSnapshotFromStore(): StoredUiSettings {
  const s = useSettings.getState();
  return {
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
    lastBackupAt: s.lastBackupAt,
  };
}

function applyStoredSettings(data: StoredUiSettings): void {
  skipNextPersist = true;
  const store = useSettings.getState();
  store.setTheme(data.theme);
  store.setBaseCurrency(data.baseCurrency);
  store.setWeekStartDay(data.weekStartDay);
  store.setDefaultView(data.defaultView as PageId);
  store.setQuickAddParser(data.quickAddParser);
  store.setAccentColor(data.accentColor);
  store.setBackupPath(data.backupPath);
  store.setAutoBackup(data.autoBackup);
  store.setBackupFrequency(data.backupFrequency);
  store.setEncryptBackups(data.encryptBackups);
  store.setBudgetAlerts(data.budgetAlerts);
  store.setWeeklyDigest(data.weeklyDigest);
  if (data.lastBackupAt !== undefined) {
    store.setLastBackupAt(data.lastBackupAt);
  }
  window.setTimeout(() => {
    skipNextPersist = false;
  }, 0);
}

export function schedulePersistSettings(): void {
  if (!isTauri() || skipNextPersist) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistSettingsNow();
  }, 400);
}

export async function persistSettingsNow(): Promise<void> {
  if (!isTauri()) return;
  await api.setUiSettings(settingsSnapshotFromStore() as unknown as Record<string, unknown>);
}

export async function hydrateSettingsFromDb(): Promise<void> {
  if (!isTauri()) return;
  const stored = await api.getUiSettings();
  if (!stored || Object.keys(stored).length === 0) {
    await persistSettingsNow();
    return;
  }
  applyStoredSettings(stored as StoredUiSettings);
}
