// Categories store: in-memory CRUD until the Rust backend is wired up.

import { create } from "zustand";
import type { Category } from "@/types";

const seedCategories: Category[] = [
  { id: "food", name: "Food", color: "#ef4444", icon: "utensils", is_active: true, created_at: "", updated_at: "" },
  { id: "transport", name: "Transport", color: "#f97316", icon: "car", is_active: true, created_at: "", updated_at: "" },
  { id: "bills", name: "Bills", color: "#3b82f6", icon: "receipt", is_active: true, created_at: "", updated_at: "" },
  { id: "shopping", name: "Shopping", color: "#a855f7", icon: "shopping-bag", is_active: true, created_at: "", updated_at: "" },
  { id: "entertainment", name: "Entertainment", color: "#ec4899", icon: "film", is_active: true, created_at: "", updated_at: "" },
  { id: "health", name: "Health", color: "#22c55e", icon: "heart", is_active: true, created_at: "", updated_at: "" },
  { id: "education", name: "Education", color: "#14b8a6", icon: "book", is_active: true, created_at: "", updated_at: "" },
  { id: "rent", name: "Rent", color: "#64748b", icon: "home", is_active: true, created_at: "", updated_at: "" },
  { id: "savings", name: "Savings", color: "#10b981", icon: "piggy-bank", is_active: true, created_at: "", updated_at: "" },
  { id: "other", name: "Other", color: "#737373", icon: "more-horizontal", is_active: true, created_at: "", updated_at: "" },
];

export const CATEGORY_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#737373",
  "#0ea5e9",
] as const;

export const CATEGORY_ICONS = [
  "utensils",
  "car",
  "receipt",
  "shopping-bag",
  "film",
  "heart",
  "book",
  "home",
  "piggy-bank",
  "plane",
  "coffee",
  "gift",
  "more-horizontal",
] as const;

interface CategoriesState {
  items: Category[];
  updateCategory: (
    id: string,
    patch: Partial<Pick<Category, "name" | "color" | "icon" | "is_active">>,
  ) => void;
  addCategory: (input: { name: string; color: string; icon: string }) => string;
  toggleActive: (id: string) => void;
}

export const useCategories = create<CategoriesState>((set) => ({
  items: seedCategories,
  updateCategory: (id, patch) =>
    set((state) => ({
      items: state.items.map((c) =>
        c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c,
      ),
    })),
  addCategory: (input) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    set((state) => ({
      items: [
        ...state.items,
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
  toggleActive: (id) =>
    set((state) => ({
      items: state.items.map((c) =>
        c.id === id ? { ...c, is_active: !c.is_active, updated_at: new Date().toISOString() } : c,
      ),
    })),
}));

export function getCategory(id: string): Category | undefined {
  return useCategories.getState().items.find((c) => c.id === id);
}
