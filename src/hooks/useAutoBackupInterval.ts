// Run scheduled auto-backups while the desktop app is open.

import { useEffect } from "react";
import { saveAutoBackupIfDue } from "@/lib/dbBootstrap";
import { isTauri } from "@/lib/tauriEnv";

const CHECK_MS = 6 * 60 * 60 * 1000;

export function useAutoBackupInterval(): void {
  useEffect(() => {
    if (!isTauri()) return;

    const run = () => {
      void saveAutoBackupIfDue();
    };

    run();
    const intervalId = window.setInterval(run, CHECK_MS);
    window.addEventListener("focus", run);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", run);
    };
  }, []);
}
