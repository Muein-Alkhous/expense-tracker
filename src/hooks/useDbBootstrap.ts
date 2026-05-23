// Bootstraps SQLite on app start (Tauri only).

import { useEffect, useState } from "react";
import { bootstrapDatabase, saveAutoBackupIfDue } from "@/lib/dbBootstrap";
import { isTauri } from "@/lib/tauriEnv";

export function useDbBootstrap(): boolean {
  const [ready, setReady] = useState(!isTauri());

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        await bootstrapDatabase();
        await saveAutoBackupIfDue();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
