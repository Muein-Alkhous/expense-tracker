// Native folder/file pickers for backup (Tauri desktop only).

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauriEnv";

export async function pickBackupFolder(currentPath: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("pick_backup_folder", {
    defaultPath: currentPath || null,
  });
}

export async function pickBackupFile(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("pick_backup_file");
}
