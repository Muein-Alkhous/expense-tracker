// Shared TypeScript types mirroring the Rust data model (see spec section 11).

export interface Expense {
  id: string;
  amount_minor: number;
  currency_code: string;
  category_id: string;
  date: string;
  note?: string;
  payment_method?: PaymentMethod;
  tags?: string[];
  is_recurring: boolean;
  recurrence_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export type PaymentMethod = "cash" | "card" | "bank" | "other";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Budget {
  id: string;
  category_id: string | null;
  limit_amount_minor: number;
  currency_code: string;
  period_type: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RecurringRule {
  id: string;
  title: string;
  amount_minor: number;
  currency_code: string;
  category_id: string;
  frequency: string;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  language: string;
  direction: "ltr" | "rtl";
  base_currency: string;
  week_start_day: number;
  backup_path?: string;
  auto_backup_enabled: boolean;
  notifications_enabled: boolean;
  last_opened_view: string;
}
