// Native receipt picker for the Tauri desktop application.

import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/tauriEnv";

export async function pickReceiptImage(): Promise<string | null> {
  if (!isTauri()) return null;

  const selected = await open({
    directory: false,
    multiple: false,
    title: "Choose receipt image",
    filters: [
      {
        name: "Receipt image",
        extensions: ["jpg", "jpeg", "png", "webp"],
      },
    ],
  });

  if (selected === null || Array.isArray(selected)) return null;
  return selected;
}
