// Category pill with a colored border outline that matches the category's color.
// Used in the Add Expense modal — the colored border is the category indicator.

import type { Category } from "@/types";

interface CategoryPillProps {
  category: Category;
  selected: boolean;
  onSelect: (id: string) => void;
}

export default function CategoryPill({ category, selected, onSelect }: CategoryPillProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      style={{
        borderColor: category.color,
        color: category.color,
        backgroundColor: selected ? hexToRgba(category.color, 0.12) : "transparent",
      }}
      className={
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all " +
        (selected ? "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900" : "hover:opacity-80")
      }
    >
      {category.name}
    </button>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
