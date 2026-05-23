// Demo categories and ~3 months of generated expenses for fresh installs / sample load.

import type { AppBackupPayload } from "@/lib/backup";
import type { CategoryBudget } from "@/store/budgets";
import type { Category, Expense, PaymentMethod } from "@/types";

const SEED_NOW = "2026-01-01T00:00:00.000Z";

export const SEED_CATEGORIES: Category[] = [
  { id: "food", name: "Food", color: "#ef4444", icon: "utensils", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "transport", name: "Transport", color: "#f97316", icon: "car", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "bills", name: "Bills", color: "#3b82f6", icon: "receipt", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "shopping", name: "Shopping", color: "#a855f7", icon: "shopping-bag", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "entertainment", name: "Entertainment", color: "#ec4899", icon: "film", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "health", name: "Health", color: "#22c55e", icon: "heart", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "education", name: "Education", color: "#14b8a6", icon: "book", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "rent", name: "Rent", color: "#64748b", icon: "home", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "savings", name: "Savings", color: "#10b981", icon: "piggy-bank", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
  { id: "other", name: "Other", color: "#737373", icon: "more-horizontal", is_active: true, created_at: SEED_NOW, updated_at: SEED_NOW },
];

export const SEED_BUDGET_ITEMS: CategoryBudget[] = [
  { categoryId: "food", limitMinor: 45000 },
  { categoryId: "transport", limitMinor: 15000 },
  { categoryId: "bills", limitMinor: 20000 },
  { categoryId: "shopping", limitMinor: 25000 },
  { categoryId: "entertainment", limitMinor: 12000 },
  { categoryId: "health", limitMinor: 8000 },
  { categoryId: "education", limitMinor: 10000 },
  { categoryId: "rent", limitMinor: 150000 },
];

export const SEED_TOTAL_MONTHLY_MINOR = 280000;

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function amountBetween(rng: () => number, minMinor: number, maxMinor: number): number {
  return Math.round(minMinor + rng() * (maxMinor - minMinor));
}

type CategoryTemplate = {
  category_id: string;
  notes: string[];
  minMinor: number;
  maxMinor: number;
  methods: PaymentMethod[];
  dailyChance: number;
};

const TEMPLATES: CategoryTemplate[] = [
  {
    category_id: "food",
    notes: ["Groceries", "Coffee shop", "Lunch", "Dinner out", "Bakery", "Takeaway"],
    minMinor: 350,
    maxMinor: 8500,
    methods: ["card", "cash"],
    dailyChance: 0.55,
  },
  {
    category_id: "transport",
    notes: ["Gas", "Uber", "Bus pass", "Parking", "Metro"],
    minMinor: 250,
    maxMinor: 4500,
    methods: ["card", "cash"],
    dailyChance: 0.28,
  },
  {
    category_id: "shopping",
    notes: ["Clothing", "Electronics", "Home supplies", "Amazon", "Pharmacy aisle"],
    minMinor: 1200,
    maxMinor: 22000,
    methods: ["card"],
    dailyChance: 0.12,
  },
  {
    category_id: "entertainment",
    notes: ["Cinema", "Concert", "Games", "Streaming", "Books"],
    minMinor: 500,
    maxMinor: 7500,
    methods: ["card"],
    dailyChance: 0.18,
  },
  {
    category_id: "health",
    notes: ["Gym", "Pharmacy", "Dentist co-pay", "Vitamins"],
    minMinor: 800,
    maxMinor: 12000,
    methods: ["card", "bank"],
    dailyChance: 0.08,
  },
  {
    category_id: "education",
    notes: ["Online course", "Textbooks", "Workshop"],
    minMinor: 1500,
    maxMinor: 18000,
    methods: ["card", "bank"],
    dailyChance: 0.05,
  },
  {
    category_id: "other",
    notes: ["Gift", "Donation", "Misc"],
    minMinor: 400,
    maxMinor: 5000,
    methods: ["cash", "card"],
    dailyChance: 0.06,
  },
];

const MONTHLY_FIXED: {
  category_id: string;
  dayOfMonth: number;
  amount_minor: number;
  note: string;
  payment_method: PaymentMethod;
  is_recurring: boolean;
}[] = [
  { category_id: "rent", dayOfMonth: 1, amount_minor: 145000, note: "Monthly rent", payment_method: "bank", is_recurring: true },
  { category_id: "bills", dayOfMonth: 5, amount_minor: 8999, note: "Internet & fiber", payment_method: "bank", is_recurring: true },
  { category_id: "bills", dayOfMonth: 12, amount_minor: 12450, note: "Electricity", payment_method: "bank", is_recurring: false },
  { category_id: "bills", dayOfMonth: 18, amount_minor: 4200, note: "Mobile plan", payment_method: "bank", is_recurring: true },
  { category_id: "entertainment", dayOfMonth: 8, amount_minor: 1599, note: "Netflix", payment_method: "card", is_recurring: true },
  { category_id: "entertainment", dayOfMonth: 15, amount_minor: 1099, note: "Spotify", payment_method: "card", is_recurring: true },
  { category_id: "health", dayOfMonth: 3, amount_minor: 4999, note: "Gym membership", payment_method: "card", is_recurring: true },
  { category_id: "savings", dayOfMonth: 25, amount_minor: 50000, note: "Monthly savings transfer", payment_method: "transfer", is_recurring: true },
];

/** ~92 days of varied expenses (deterministic for stable demos). */
export function generateSeedExpenses(currencyCode = "USD"): Expense[] {
  const rng = mulberry32(20260523);
  const expenses: Expense[] = [];
  let seq = 1;
  const stamp = new Date().toISOString();

  const push = (row: Omit<Expense, "id" | "currency_code" | "created_at" | "updated_at">) => {
    expenses.push({
      ...row,
      id: `seed-${seq++}`,
      currency_code: currencyCode,
      created_at: stamp,
      updated_at: stamp,
    });
  };

  const daysBack = 92;

  for (let dayOffset = 0; dayOffset <= daysBack; dayOffset++) {
    const date = daysAgo(dayOffset);
    const dom = new Date(date + "T12:00:00").getDate();

    for (const fixed of MONTHLY_FIXED) {
      if (dom === fixed.dayOfMonth) {
        push({
          amount_minor: fixed.amount_minor,
          category_id: fixed.category_id,
          date,
          note: fixed.note,
          payment_method: fixed.payment_method,
          is_recurring: fixed.is_recurring,
        });
      }
    }

    for (const tpl of TEMPLATES) {
      if (rng() > tpl.dailyChance) continue;
      const extra = rng() < 0.15 ? 1 : 0;
      for (let n = 0; n <= extra; n++) {
        push({
          amount_minor: amountBetween(rng, tpl.minMinor, tpl.maxMinor),
          category_id: tpl.category_id,
          date,
          note: pick(rng, tpl.notes),
          payment_method: pick(rng, tpl.methods),
          is_recurring: false,
        });
      }
    }
  }

  return expenses.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export const SEED_EXPENSES: Expense[] = generateSeedExpenses();

export function buildSeedPayload(settings: AppBackupPayload["settings"]): AppBackupPayload {
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    expenses: generateSeedExpenses(settings.baseCurrency),
    categories: SEED_CATEGORIES,
    budgets: {
      totalMonthlyMinor: SEED_TOTAL_MONTHLY_MINOR,
      items: SEED_BUDGET_ITEMS,
    },
    fx_rates: [],
    settings,
  };
}
