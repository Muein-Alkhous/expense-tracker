// Subscribes to settings and applies theme, accent, and default view on load.

import { useEffect, useRef } from "react";
import {
  applyAccentColor,
  applyTheme,
  subscribeSystemTheme,
} from "@/lib/applySettings";
import { schedulePersistSettings } from "@/lib/settingsDb";
import { isTauri } from "@/lib/tauriEnv";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

export function useSettingsSync(): void {
  const theme = useSettings((s) => s.theme);
  const accentColor = useSettings((s) => s.accentColor);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const appliedDefaultView = useRef(false);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    return subscribeSystemTheme(() => applyTheme("system"));
  }, [theme]);

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  useEffect(() => {
    const applyOnHydrate = () => {
      const s = useSettings.getState();
      useFxRates.getState().seedDefaultsIfEmpty();
      applyTheme(s.theme);
      applyAccentColor(s.accentColor);
      if (!appliedDefaultView.current) {
        setCurrentPage(s.defaultView);
        appliedDefaultView.current = true;
      }
    };

    if (useSettings.persist.hasHydrated()) {
      applyOnHydrate();
    }
    const unsub = useSettings.persist.onFinishHydration(applyOnHydrate);
    return unsub;
  }, [setCurrentPage]);

  useEffect(() => {
    if (!isTauri()) return;
    return useSettings.subscribe(() => {
      schedulePersistSettings();
    });
  }, []);
}
