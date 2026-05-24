// i18next setup: loads locale resources and applies dir/lang to <html> (see spec 9.13).

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/common.json";
import ar from "@/locales/ar/common.json";
import enReports from "@/locales/en/reports.json";
import arReports from "@/locales/ar/reports.json";

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en, reports: enReports },
    ar: { common: ar, reports: arReports },
  },
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
