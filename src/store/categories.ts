// Categories store: SQLite via Tauri when available, else localStorage persist.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import { SEED_CATEGORIES } from "@/lib/seedData";
import type { Category } from "@/types";

export const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899", "#64748b", "#737373", "#0ea5e9",
] as const;

export const CATEGORY_ICONS = [
  "utensils", "car", "receipt", "shopping-bag", "film", "heart",
  "book", "home", "piggy-bank", "plane", "coffee", "gift", "more-horizontal",
] as const;

interface CategoriesState {
  items: Category[];
  hydrated: boolean;
  loadFromDb: () => Promise<void>;
  updateCategory: (
    id: string,
    patch: Partial<Pick<Category, "name" | "color" | "icon" | "is_active">>,
  ) => Promise<void>;
  addCategory: (input: { name: string; color: string; icon: string }) => Promise<string>;
  deleteCategory: (id: string) => Promise<boolean>;
  toggleActive: (id: string) => Promise<void>;
  replaceAll: (items: Category[]) => void;
}

const storeImpl = (set: (partial: Partial<CategoriesState> | ((s: CategoriesState) => Partial<CategoriesState>)) => void, get: () => CategoriesState): CategoriesState => ({
  items: isTauri() ? [] : SEED_CATEGORIES,
  hydrated: !isTauri(),

  loadFromDb: async () => {
    if (!isTauri()) {
      set(() => ({ hydrated: true }));
      return;
    }
    const items = await api.listCategories();
    set(() => ({ items, hydrated: true }));
  },

  updateCategory: async (id, patch) => {
    const cat = get().items.find((c) => c.id === id);
    if (!cat) return;
    const next = {
      name: patch.name ?? cat.name,
      color: patch.color ?? cat.color,
      icon: patch.icon ?? cat.icon,
      is_active: patch.is_active ?? cat.is_active,
    };
    if (isTauri()) {
      const updated = await api.updateCategory(
        id,
        next.name,
        next.color,
        next.icon,
        next.is_active,
      );
      set((s) => ({
        items: s.items.map((c) => (c.id === id ? updated : c)),
      }));
      return;
    }
    set((s) => ({
      items: s.items.map((c) =>
        c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c,
      ),
    }));
  },

  addCategory: async (input) => {
    if (isTauri()) {
      const cat = await api.createCategory(input);
      set((s) => ({ items: [...s.items, cat] }));
      return cat.id;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    set((s) => ({
      items: [
        ...s.items,
        {
          id,
          name: input.name,
          color: input.color,
          icon: input.icon,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
    }));
    return id;
  },

  deleteCategory: async (id) => {
    const { items } = get();
    if (items.length <= 1) return false;
    if (!items.some((c) => c.id === id)) return false;
    if (isTauri()) {
      await api.deleteCategory(id);
    }
    set({ items: items.filter((c) => c.id !== id) });
    return true;
  },

  toggleActive: async (id) => {
    const cat = get().items.find((c) => c.id === id);
    if (!cat) return;
    await get().updateCategory(id, { is_active: !cat.is_active });
  },

  replaceAll: (items) => set({ items }),
});

export const useCategories = isTauri()
  ? create<CategoriesState>()(storeImpl)
  : create<CategoriesState>()(
      persist(storeImpl, {
        name: "expense-tracker-categories",
        partialize: (state) => ({ items: state.items }),
      }),
    );

export function getCategory(id: string): Category | undefined {
  return useCategories.getState().items.find((c) => c.id === id);
}
