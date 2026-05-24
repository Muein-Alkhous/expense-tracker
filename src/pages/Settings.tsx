// Settings screen: general, appearance, currency, backup, notifications, about.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Toggle from "@/components/ui/Toggle";
import FxRatesPanel from "@/components/FxRatesPanel";
import {
  buildBackupPayload,
  downloadBackupFile,
  formatSize,
  parseBackupFileContent,
  restoreBackupPayload,
  saveBackupToConfiguredFolder,
} from "@/lib/backup";
import { pickBackupFile, pickBackupFolder } from "@/lib/backupDialog";
import { loadDemoData } from "@/lib/dbBootstrap";
import { api, type BackupFileInfo } from "@/lib/api";
import { schedulePersistSettings } from "@/lib/settingsDb";
import { isTauri } from "@/lib/tauriEnv";
import RecurringExpensesPanel from "@/components/RecurringExpensesPanel";
import {
  ACCENT_SWATCHES,
  useSettings,
  type SettingsSection,
  type ThemeMode,
} from "@/store/settings";
import type { PageId } from "@/store/ui";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "currency", label: "Currency" },
  { id: "backup", label: "Backup & Restore" },
  { id: "recurring", label: "Recurring" },
  { id: "notifications", label: "Notifications" },
  { id: "about", label: "About" },
];

const DEFAULT_VIEWS: { id: PageId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "expenses", label: "Expenses" },
  { id: "trash", label: "Trash" },
  { id: "budgets", label: "Budgets" },
  { id: "reports", label: "Reports" },
];

const CURRENCIES = ["USD", "EUR", "TRY", "SYP", "GBP"];

export default function Settings() {
  const [section, setSection] = useState<SettingsSection>("general");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [diskBackups, setDiskBackups] = useState<BackupFileInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const s = useSettings();

  const loadDiskBackups = useCallback(async () => {
    if (!isTauri()) return;
    setLoadingBackups(true);
    try {
      const list = await api.listBackups(s.backupPath);
      setDiskBackups(list);
    } catch {
      setDiskBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }, [s.backupPath]);

  useEffect(() => {
    if (section === "backup" && isTauri()) {
      void loadDiskBackups();
    }
  }, [section, loadDiskBackups]);

  function showStatus(tone: "ok" | "error", message: string) {
    setStatus({ tone, message });
    window.setTimeout(() => setStatus(null), 5000);
  }

  async function handleBackupNow() {
    let password: string | undefined;
    if (s.encryptBackups) {
      const entered = window.prompt("Enter a password to encrypt this backup:");
      if (!entered) return;
      password = entered;
    }
    try {
      const payload = buildBackupPayload();
      if (isTauri()) {
        const path = await saveBackupToConfiguredFolder(
          s.backupPath,
          payload,
          s.encryptBackups,
          password,
        );
        s.setLastBackupAt(new Date().toISOString());
        schedulePersistSettings();
        await loadDiskBackups();
        showStatus("ok", `Backup downloaded successfully. Saved to ${path}`);
        return;
      }
      downloadBackupFile(payload, s.encryptBackups, password);
      showStatus("ok", "Backup downloaded successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Backup failed. Please try again.";
      showStatus("error", msg);
    }
  }

  function handleRestoreFile(file: File, encryptedHint?: boolean) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = String(reader.result ?? "");
        const encrypted = encryptedHint ?? file.name.endsWith(".enc.json");
        let password: string | undefined;
        if (encrypted) {
          password = window.prompt("Enter the backup password:") ?? undefined;
          if (!password) return;
        }
        if (!window.confirm("Restore will replace all current data. Continue?")) return;

        const payload = parseBackupFileContent(raw, encrypted, password);
        await restoreBackupPayload(payload);
        showStatus("ok", "Backup restored. Your data has been reloaded.");
      } catch (err) {
        showStatus("error", err instanceof Error ? err.message : "Restore failed.");
      }
    };
    reader.readAsText(file);
  }

  async function handleRestoreFromPath(filePath: string, encrypted: boolean) {
    try {
      let password: string | undefined;
      if (encrypted) {
        password = window.prompt("Enter the backup password:") ?? undefined;
        if (!password) return;
      }
      if (!window.confirm("Restore will replace all current data. Continue?")) return;

      const raw = await api.readBackupFile(filePath);
      const payload = parseBackupFileContent(raw, encrypted, password);
      await restoreBackupPayload(payload);
      showStatus("ok", "Backup restored. Your data has been reloaded.");
    } catch (err) {
      showStatus("error", err instanceof Error ? err.message : "Restore failed.");
    }
  }

  async function handleChooseBackupFolder() {
    try {
      const folder = await pickBackupFolder(s.backupPath);
      if (!folder) return;
      s.setBackupPath(folder);
      schedulePersistSettings();
      await loadDiskBackups();
    } catch (err) {
      showStatus("error", err instanceof Error ? err.message : "Could not choose folder.");
    }
  }

  async function handlePickRestoreFile() {
    if (isTauri()) {
      try {
        const path = await pickBackupFile();
        if (!path) return;
        const encrypted = path.endsWith(".enc.json") || path.endsWith(".enc");
        await handleRestoreFromPath(path, encrypted);
      } catch (err) {
        showStatus("error", err instanceof Error ? err.message : "Restore failed.");
      }
      return;
    }
    restoreInputRef.current?.click();
  }

  return (
    <div className="flex h-full min-h-0 gap-8 p-8">
      <nav className="hidden w-44 shrink-0 flex-col gap-0.5 sm:flex">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={
              "rounded-control px-3 py-2 text-start text-sm transition-colors " +
              (section === item.id
                ? "bg-accent/10 font-medium text-accent dark:bg-indigo-500/20 dark:text-indigo-100 dark:ring-1 dark:ring-indigo-400/40"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50")
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {status && (
          <div
            role="status"
            className={
              "mb-4 rounded-control border px-4 py-3 text-sm " +
              (status.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200")
            }
          >
            {status.message}
          </div>
        )}

        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,.enc.json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleRestoreFile(file);
            e.target.value = "";
          }}
        />


        <div className="mb-6 sm:hidden">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Section
          </label>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SettingsSection)}
            className="w-full rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:[color-scheme:dark]"
          >
            {SECTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {section === "general" && (
          <SettingsPanel title="General" description="Calendar and default views.">
            <Field label="Week starts on" hint="Used for weekly summaries and filters.">
              <Segmented
                options={[
                  { value: 0, label: "Sun" },
                  { value: 1, label: "Mon" },
                  { value: 6, label: "Sat" },
                ]}
                value={s.weekStartDay}
                onChange={s.setWeekStartDay}
              />
            </Field>
            <Field label="Default view" hint="Screen shown when the app opens.">
              <Select
                value={s.defaultView}
                options={DEFAULT_VIEWS.map((v) => ({ value: v.id, label: v.label }))}
                onChange={(v) => s.setDefaultView(v as PageId)}
              />
            </Field>
            <Row
              label="Quick-add parser"
              hint="Automatically detect amounts and dates in pasted text."
            >
              <Toggle
                checked={s.quickAddParser}
                onChange={s.setQuickAddParser}
                label="Quick-add parser"
              />
            </Row>
          </SettingsPanel>
        )}

        {section === "appearance" && (
          <SettingsPanel title="Appearance" description="Theme and accent color.">
            <Field label="Theme">
              <div className="grid grid-cols-3 gap-3">
                {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => s.setTheme(mode)}
                    className={
                      "rounded-card border-2 p-3 text-start transition-colors " +
                      (s.theme === mode
                        ? "border-accent bg-accent/5 dark:border-indigo-400 dark:bg-indigo-500/15"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-600 dark:hover:border-neutral-500")
                    }
                  >
                    <ThemePreview mode={mode} />
                    <span className="mt-2 block text-sm font-medium capitalize text-neutral-900 dark:text-neutral-100">
                      {mode}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Accent color">
              <div className="flex flex-wrap gap-3">
                {ACCENT_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => s.setAccentColor(color)}
                    aria-label={`Accent ${color}`}
                    className={
                      "h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 " +
                      (s.accentColor === color ? "border-neutral-900 dark:border-white" : "border-transparent")
                    }
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </Field>
          </SettingsPanel>
        )}

        {section === "currency" && (
          <SettingsPanel
            title="Currency"
            description="Multi-currency expenses with local FX conversion into your base currency."
          >
            <Field label="Base currency" hint="All dashboard totals use this currency.">
              <Select
                value={s.baseCurrency}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                onChange={s.setBaseCurrency}
              />
            </Field>
            <FxRatesPanel />
          </SettingsPanel>
        )}

        {section === "backup" && (
          <SettingsPanel
            title="Backup & Restore"
            description="Local JSON backups — your data never leaves this device."
          >
            <div className="rounded-card border border-neutral-200 bg-neutral-50/50 p-5 space-y-5 dark:border-neutral-700 dark:bg-neutral-900/90">
              <Field label="Local backup path">
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={s.backupPath}
                    onChange={(e) => {
                      s.setBackupPath(e.target.value);
                      schedulePersistSettings();
                    }}
                    className="min-w-0 flex-1"
                  />
                  {isTauri() && (
                    <Button variant="ghost" type="button" onClick={() => void handleChooseBackupFolder()}>
                      Choose folder
                    </Button>
                  )}
                  <Button variant="ghost" type="button" onClick={() => void handlePickRestoreFile()}>
                    Restore file…
                  </Button>
                </div>
              </Field>
              <Row
                label="Automatic backups"
                hint={
                  isTauri()
                    ? "On app start and every 6 hours while open, saves a JSON snapshot to your backup folder when due (skipped when encryption is on)."
                    : "On app start, saves a JSON snapshot to your backup folder when due."
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Toggle checked={s.autoBackup} onChange={s.setAutoBackup} label="Auto backup" />
                  <select
                    value={s.backupFrequency}
                    disabled={!s.autoBackup}
                    onChange={(e) =>
                      s.setBackupFrequency(e.target.value as "daily" | "weekly" | "monthly")
                    }
                    className="rounded-control border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:[color-scheme:dark]"
                  >
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                  </select>
                </div>
              </Row>
              <Row label="Encryption" hint="Encrypt backups with a master password.">
                <Toggle
                  checked={s.encryptBackups}
                  onChange={s.setEncryptBackups}
                  label="Encrypt backups"
                />
              </Row>
              <Button type="button" className="w-full" onClick={handleBackupNow}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Backup now
              </Button>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {isTauri()
                  ? "Saves a backup file to the folder above. Recent files are listed from that folder on disk."
                  : "Downloads a JSON file to your browser's Downloads folder. Use Restore file to pick a backup."}
              </p>
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {isTauri() ? "Backups on disk" : "Recent backups"}
                </h3>
                {isTauri() ? (
                  loadingBackups ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading backups…</p>
                  ) : diskBackups.length === 0 ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      No backup files in this folder yet. Click Backup now to create one.
                    </p>
                  ) : (
                    <ul className="divide-y divide-neutral-200 rounded-control border border-neutral-200 bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-950">
                      {diskBackups.map((b) => (
                        <li
                          key={b.path}
                          className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                              {b.name}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {b.modified_at} · {formatSize(b.size_bytes)}
                              {b.encrypted ? " · Encrypted" : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRestoreFromPath(b.path, b.encrypted)}
                            className="shrink-0 text-xs font-medium text-accent hover:underline"
                          >
                            Restore
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : s.backupHistory.length === 0 ? (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    No backups yet. Click Backup now to create one.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-200 rounded-control border border-neutral-200 bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-950">
                    {s.backupHistory.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">{b.name}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {b.date} · {b.size}
                            {b.encrypted ? " · Encrypted" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handlePickRestoreFile()}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Restore file…
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </SettingsPanel>
        )}

        {section === "recurring" && (
          <SettingsPanel
            title="Recurring expenses"
            description="Rules that materialize into expenses on a schedule (daily, weekly, or monthly)."
          >
            <RecurringExpensesPanel />
          </SettingsPanel>
        )}

        {section === "notifications" && (
          <SettingsPanel title="Notifications" description="Alerts and digests (stored locally).">
            <Row label="Budget alerts" hint="Show warnings on the Budgets page when limits are exceeded.">
              <Toggle checked={s.budgetAlerts} onChange={s.setBudgetAlerts} label="Budget alerts" />
            </Row>
            <Row label="Weekly digest" hint="Reserved for a future email-style summary (preference saved now).">
              <Toggle checked={s.weeklyDigest} onChange={s.setWeeklyDigest} label="Weekly digest" />
            </Row>
            {s.budgetAlerts && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Budget alerts appear as a banner on the Budgets screen when spending exceeds a category or monthly limit.
              </p>
            )}
          </SettingsPanel>
        )}

        {section === "about" && (
          <SettingsPanel title="About" description="">
            <div className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Expense Tracker</p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Version 0.1.0 · Local-first</p>
              <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                A minimal personal finance app. Your data is stored locally in SQLite on this device. No account required.
              </p>
              <div className="mt-6 border-t border-neutral-200 pt-6 dark:border-neutral-700">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Sample data</p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  Load 10 categories and about three months of demo expenses (replaces current data).
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3"
                  onClick={async () => {
                    if (!window.confirm("Replace all expenses, categories, and budgets with demo data? This cannot be undone.")) {
                      return;
                    }
                    try {
                      await loadDemoData();
                      showStatus("ok", "Demo data loaded — check Dashboard and Expenses.");
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Could not load demo data.";
                      showStatus("error", msg);
                    }
                  }}
                >
                  Load sample data
                </Button>
              </div>
              <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500">
                Built with Tauri, React, and Recharts.
              </p>
            </div>
          </SettingsPanel>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="max-w-2xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
        )}
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-6 last:border-0 dark:border-neutral-800">
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-xs rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-accent focus:outline-none dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:[color-scheme:dark]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-control border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-600 dark:bg-neutral-950">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            "rounded px-3 py-1.5 text-sm transition-colors " +
            (value === o.value
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/80 dark:hover:text-white")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const bg =
    mode === "dark" ? "bg-neutral-800" : mode === "light" ? "bg-white" : "bg-gradient-to-br from-white to-neutral-200";
  const bar = mode === "dark" ? "bg-neutral-600" : "bg-neutral-200";
  return (
    <div className={`h-16 overflow-hidden rounded border border-neutral-200 dark:border-neutral-600 ${bg} p-2`}>
      <div className={`mb-2 h-2 w-1/2 rounded ${bar}`} />
      <div className="flex gap-1">
        <div className={`h-8 flex-1 rounded ${bar}`} />
        <div className={`h-8 w-1/3 rounded ${bar}`} />
      </div>
    </div>
  );
}
