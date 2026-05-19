// Single category row in the Categories list: icon, stats, active toggle.

import Toggle from "@/components/ui/Toggle";
import { CategoryIcon } from "@/lib/categoryIcons";
import type { Category } from "@/types";

interface CategoryListItemProps {
  category: Category;
  expenseCount: number;
  totalMinor: number;
  totalFormatted: string;
  selected: boolean;
  onSelect: () => void;
  onToggleActive: () => void;
}

export default function CategoryListItem({
  category,
  expenseCount,
  totalFormatted,
  selected,
  onSelect,
  onToggleActive,
}: CategoryListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-b-0 dark:border-neutral-800 " +
        (selected ? "bg-accent/5" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50")
      }
    >
      <span className="cursor-grab text-neutral-300 dark:text-neutral-600" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </span>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${category.color}18`, color: category.color }}
      >
        <CategoryIcon name={category.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {category.name}
        </span>
        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
          {expenseCount} {expenseCount === 1 ? "expense" : "expenses"} · {totalFormatted} total
        </span>
      </span>
      <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Toggle
          checked={category.is_active}
          onChange={onToggleActive}
          label={`Toggle ${category.name}`}
        />
      </span>
    </button>
  );
}
