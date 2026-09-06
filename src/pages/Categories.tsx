// Categories screen: list with stats, search, and an edit/create panel.

import { useEffect, useMemo, useState } from "react";
import CategoryListItem from "@/components/CategoryListItem";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Toggle from "@/components/ui/Toggle";
import { CategoryIcon } from "@/lib/categoryIcons";
import { amountInBase } from "@/lib/expenseInBase";
import { activeExpenses } from "@/lib/expenseFilters";
import { formatMinor } from "@/lib/money";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";
import { useBudgets } from "@/store/budgets";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  useCategories,
} from "@/store/categories";
import { useExpenses } from "@/store/expenses";

interface CategoryDraft {
  name: string;
  color: string;
  icon: string;
  is_active: boolean;
}

const EMPTY_DRAFT: CategoryDraft = {
  name: "",
  color: CATEGORY_COLORS[0],
  icon: CATEGORY_ICONS[0],
  is_active: true,
};

export default function Categories() {
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const fxRates = useFxRates((s) => s.rates);
  const categories = useCategories((s) => s.items);
  const updateCategory = useCategories((s) => s.updateCategory);
  const addCategory = useCategories((s) => s.addCategory);
  const deleteCategory = useCategories((s) => s.deleteCategory);
  const toggleActive = useCategories((s) => s.toggleActive);
  const removeBudget = useBudgets((s) => s.removeBudget);
  const expenses = useExpenses((s) => s.items);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(categories[0]?.id ?? null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (categories[0] && selectedId && !isCreating) {
      const cat = categories.find((c) => c.id === selectedId);
      if (cat) {
        setDraft({
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          is_active: cat.is_active,
        });
      }
    }
  }, [categories, selectedId, isCreating]);

  function handleToggleActive(id: string) {
    toggleActive(id);
    const cat = useCategories.getState().items.find((c) => c.id === id);
    if (cat && id === selectedId) {
      setDraft((d) => ({ ...d, is_active: cat.is_active }));
    }
  }

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const e of activeExpenses(expenses)) {
      const row = map.get(e.category_id) ?? { count: 0, total: 0 };
      row.count += 1;
      const { amountMinor, ok } = amountInBase(e, baseCurrency, fxRates);
      if (ok) row.total += amountMinor;
      map.set(e.category_id, row);
    }
    return map;
  }, [expenses, baseCurrency, fxRates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const selected = categories.find((c) => c.id === selectedId);

  function loadDraft(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setIsCreating(false);
    setSelectedId(categoryId);
    setDraft({
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      is_active: cat.is_active,
    });
  }

  function startCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT });
  }

  function cancelEdit() {
    if (isCreating) {
      setIsCreating(false);
      if (categories[0]) loadDraft(categories[0].id);
      return;
    }
    if (selected) loadDraft(selected.id);
  }

  async function saveDraft() {
    const name = draft.name.trim();
    if (!name) return;

    if (isCreating) {
      const id = await addCategory({ name, color: draft.color, icon: draft.icon });
      if (draft.is_active === false) await toggleActive(id);
      setIsCreating(false);
      setSelectedId(id);
      loadDraft(id);
      return;
    }

    if (!selectedId) return;
    await updateCategory(selectedId, {
      name,
      color: draft.color,
      icon: draft.icon,
      is_active: draft.is_active,
    });
  }

  async function handleDeleteCategory() {
    if (!selectedId || isCreating || !selected) return;
    const hasActive = expenses.some(
      (e) => !e.deleted_at && e.category_id === selectedId,
    );
    if (hasActive) {
      window.alert(`Cannot delete "${selected.name}" while expenses still use this category. Delete or move those expenses first.`);
      return;
    }
    if (
      !window.confirm(`Delete category "${selected.name}"? Budgets linked to this category will be removed. This cannot be undone.`)
    )
      return;
    if (!(await deleteCategory(selectedId))) return;
    removeBudget(selectedId);
    const next = useCategories.getState().items[0];
    if (next) {
      setIsCreating(false);
      setSelectedId(next.id);
      setDraft({
        name: next.name,
        color: next.color,
        icon: next.icon,
        is_active: next.is_active,
      });
    } else {
      setSelectedId(null);
      setDraft({ ...EMPTY_DRAFT });
    }
  }

  const insightCategory = selected ?? (isCreating ? null : categories[0]);
  const insightStats = insightCategory ? stats.get(insightCategory.id) : undefined;

  return (
    <div className="flex h-full flex-col p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-neutral-400 dark:text-neutral-500">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="w-full rounded-control border border-neutral-200 bg-white py-2 ps-9 pe-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
        <Button onClick={startCreate}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add category
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="flex flex-col overflow-hidden rounded-card border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-3">
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Active categories
            </h2>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {filtered.length} items
            </span>
          </header>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {search.trim() ? "No categories match your search." : "No categories yet."}
              </p>
            ) : (
              filtered.map((cat) => {
                const row = stats.get(cat.id) ?? { count: 0, total: 0 };
                return (
                  <CategoryListItem
                    key={cat.id}
                    category={cat}
                    expenseCount={row.count}
                    totalMinor={row.total}
                    totalFormatted={formatMinor(row.total, baseCurrency)}
                    selected={!isCreating && selectedId === cat.id}
                    onSelect={() => loadDraft(cat.id)}
                    onToggleActive={() => handleToggleActive(cat.id)}
                  />
                );
              })
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {isCreating ? "New Category" : "Edit Category"}
              </h2>
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                Active
                <Toggle
                  checked={draft.is_active}
                  onChange={(v) => setDraft({ ...draft, is_active: v })}
                  label="Category active"
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Category name
                </label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Transport"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Category color
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft({ ...draft, color })}
                      aria-label={`Color ${color}`}
                      className={
                        "h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 " +
                        (draft.color === color ? "border-neutral-900 dark:border-neutral-50" : "border-transparent")
                      }
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Icon
                  </label>
                  <span className="text-xs text-accent">Browse all</span>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {CATEGORY_ICONS.map((icon) => {
                    const active = draft.icon === icon;
                    return (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setDraft({ ...draft, icon })}
                        className={
                          "flex h-10 w-10 items-center justify-center rounded-control border transition-colors " +
                          (active
                            ? "border-accent bg-accent text-white"
                            : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500")
                        }
                      >
                        <CategoryIcon name={icon} size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveDraft} className="min-w-[10rem] flex-1">
                  {isCreating ? "Create Category" : "Save Changes"}
                </Button>
                {!isCreating && selectedId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDeleteCategory}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                  >
                    Delete category
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>

          {insightCategory && insightStats && (
            <div className="rounded-card border border-accent/20 bg-accent/5 p-5 dark:border-accent/30 dark:bg-accent/10">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent dark:text-indigo-300">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6" /><path d="M10 22h4" />
                  <path d="M12 2a7 7 0 0 0-4 12v1H6a1 1 0 0 0-1 1v2h12a1 1 0 0 0 1-1v-2h-2v-1a7 7 0 0 0-4-12z" />
                </svg>
                Spending insight
              </div>
              <p
                className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
                dangerouslySetInnerHTML={{
                  __html: `<strong>${insightCategory.name}</strong> has ${insightStats.count} recorded ${insightStats.count === 1 ? "expense" : "expenses"} totalling ${formatMinor(insightStats.total, baseCurrency)}. Consider setting a budget for this category if spending feels high.`,
                }}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
