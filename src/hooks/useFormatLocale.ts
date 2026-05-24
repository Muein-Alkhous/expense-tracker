import { useSettings } from "@/store/settings";

/** BCP 47 locale for Intl and money formatting. */
export function useFormatLocale(): string {
  const language = useSettings((s) => s.language);
  return language === "ar" ? "ar" : "en-US";
}
