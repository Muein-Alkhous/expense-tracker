// Subscribes to settings and applies theme, accent, language, and default view on load.

import { useEffect, useRef } from "react";
import {
  applyAccentColor,
  applyLanguage,
  applyTheme,
  subscribeSystemTheme,
} from "@/lib/applySettings";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

export function useSettingsSync(): void {
  const theme = useSettings((s) => s.theme);
  const accentColor = useSettings((s) => s.accentColor);
  const language = useSettings((s) => s.language);
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
    void applyLanguage(language);
  }, [language]);

  useEffect(() => {
    const applyOnHydrate = () => {
      const s = useSettings.getState();
      useFxRates.getState().seedDefaultsIfEmpty();
      applyTheme(s.theme);
      applyAccentColor(s.accentColor);
      void applyLanguage(s.language);
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
}
