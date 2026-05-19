// Maps category icon keys to Lucide components.

import {
  Book,
  Car,
  Coffee,
  Film,
  Gift,
  Heart,
  Home,
  MoreHorizontal,
  Plane,
  PiggyBank,
  Receipt,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  film: Film,
  heart: Heart,
  book: Book,
  home: Home,
  "piggy-bank": PiggyBank,
  plane: Plane,
  coffee: Coffee,
  gift: Gift,
  "more-horizontal": MoreHorizontal,
};

export function CategoryIcon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_MAP[name] ?? MoreHorizontal;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
