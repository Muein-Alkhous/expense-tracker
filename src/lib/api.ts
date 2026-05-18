// Thin wrapper around Tauri's invoke() that adds typing and centralizes error handling.

import { invoke } from "@tauri-apps/api/core";

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}
