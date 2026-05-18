// Selectable category chip with the category's color and a checked state.

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
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors " +
        (selected
          ? "border-accent bg-accent/10 text-neutral-900 dark:text-neutral-50"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700")
      }
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </button>
  );
}
