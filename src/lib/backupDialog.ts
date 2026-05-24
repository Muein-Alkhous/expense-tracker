// Native folder/file pickers for backup (Tauri desktop only).
// Uses the dialog plugin so the picker runs off the main thread (blocking rfd in a
// command freezes the webview and makes the app appear crashed).

import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/tauriEnv";

export async function pickBackupFolder(currentPath: string): Promise<string | null> {
  if (!isTauri()) return null;

  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: currentPath.trim() || undefined,
    title: "Choose backup folder",
  });

  if (selected === null || Array.isArray(selected)) return null;
  return selected;
}

export async function pickBackupFile(): Promise<string | null> {
  if (!isTauri()) return null;

  const selected = await open({
    directory: false,
    multiple: false,
    title: "Choose backup file to restore",
    filters: [
      { name: "JSON backup", extensions: ["json"] },
      { name: "Encrypted backup", extensions: ["enc.json"] },
    ],
  });

  if (selected === null || Array.isArray(selected)) return null;
  return selected;
}
