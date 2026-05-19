// Modal to create or update a category budget or the total monthly cap.
// Category limits cannot sum above the total monthly (master) budget.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CategoryPill from "@/components/CategoryPill";
import { CategoryIcon } from "@/lib/categoryIcons";
import { formatMinor, toMajor, toMinor } from "@/lib/money";
import {
  canSetCategoryBudget,
  canSetTotalMonthly,
  maxCategoryBudgetMinor,
  projectedCategorySumMinor,
  sumCategoryBudgetsMinor,
  useBudgets,
} from "@/store/budgets";
import { useCategories } from "@/store/categories";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

type BudgetKind = "category" | "total";

export default function NewBudgetModal() {
  const open = useUi((s) => s.newBudgetOpen);
  const prefillCategoryId = useUi((s) => s.newBudgetCategoryId);
  const close = useUi((s) => s.closeNewBudget);
  const setBudget = useBudgets((s) => s.setBudget);
  const setTotalMonthly = useBudgets((s) => s.setTotalMonthly);
  const totalMonthlyMinor = useBudgets((s) => s.totalMonthlyMinor);
  const budgetItems = useBudgets((s) => s.items);
  const baseCurrency = useSettings((s) => s.baseCurrency);

  const allCategories = useCategories((s) => s.items);
  const categories = useMemo(
    () => allCategories.filter((c) => c.is_active),
    [allCategories],
  );

  const [kind, setKind] = useState<BudgetKind>("category");
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const limitRef = useRef<HTMLInputElement>(null);

  const existingLimit = useMemo(() => {
    if (kind !== "category" || !categoryId) return null;
    return budgetItems.find((b) => b.categoryId === categoryId)?.limitMinor ?? null;
  }, [kind, categoryId, budgetItems]);

  const allocatedMinor = useMemo(
    () => sumCategoryBudgetsMinor(budgetItems),
    [budgetItems],
  );

  const parsedLimit = parseFloat(limit);
  const limitMinor =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? toMinor(parsedLimit, baseCurrency)
      : null;

  const maxAllowedMinor = useMemo(() => {
    if (kind !== "category" || !categoryId) return 0;
    return maxCategoryBudgetMinor(budgetItems, totalMonthlyMinor, categoryId);
  }, [kind, categoryId, budgetItems, totalMonthlyMinor]);

  const categoryValid =
    kind !== "category" ||
    !categoryId ||
    limitMinor === null ||
    canSetCategoryBudget(budgetItems, totalMonthlyMinor, categoryId, limitMinor);

  const totalValid =
    kind !== "total" ||
    limitMinor === null ||
    canSetTotalMonthly(budgetItems, limitMinor);

  useEffect(() => {
    if (!open) return;
    const prefill = prefillCategoryId ?? categories[0]?.id ?? "";
    setKind("category");
    setCategoryId(prefill);
    setError(null);
    const existing = useBudgets.getState().items.find((b) => b.categoryId === prefill);
    setLimit(existing ? String(toMajor(existing.limitMinor, baseCurrency)) : "");
    setTimeout(() => limitRef.current?.focus(), 50);
  }, [open, prefillCategoryId, categories, baseCurrency]);

  useEffect(() => {
    if (!open || kind !== "category" || !categoryId) return;
    const existing = budgetItems.find((b) => b.categoryId === categoryId);
    setLimit(existing ? String(toMajor(existing.limitMinor, baseCurrency)) : "");
    setError(null);
  }, [open, kind, categoryId, budgetItems, baseCurrency]);

  useEffect(() => {
    if (!open || kind !== "total") return;
    setLimit(String(toMajor(totalMonthlyMinor, baseCurrency)));
    setError(null);
  }, [open, kind, totalMonthlyMinor, baseCurrency]);

  function handleSave(e?: FormEvent) {
    e?.preventDefault();
    const value = parseFloat(limit);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a limit greater than zero.");
      limitRef.current?.focus();
      return;
    }
    const nextMinor = toMinor(value, baseCurrency);

    if (kind === "total") {
      if (!canSetTotalMonthly(budgetItems, nextMinor)) {
        setError(
          `Total monthly budget cannot be less than allocated category budgets (${formatMinor(allocatedMinor, baseCurrency)}).`,
        );
        return;
      }
      if (!setTotalMonthly(nextMinor)) return;
    } else {
      if (!categoryId) return;
      if (!canSetCategoryBudget(budgetItems, totalMonthlyMinor, categoryId, nextMinor)) {
        const projected = projectedCategorySumMinor(budgetItems, categoryId, nextMinor);
        setError(
          `Category budgets would total ${formatMinor(projected, baseCurrency)}, which exceeds the monthly cap of ${formatMinor(totalMonthlyMinor, baseCurrency)}. Maximum for this category: ${formatMinor(maxCategoryBudgetMinor(budgetItems, totalMonthlyMinor, categoryId), baseCurrency)}.`,
        );
        return;
      }
      if (!setBudget(categoryId, nextMinor)) return;
    }
    close();
  }

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isUpdate = kind === "category" ? existingLimit !== null : true;

  return (
    <Modal
      open={open}
      onClose={close}
      title={isUpdate ? "Edit budget" : "New budget"}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => handleSave()}
            disabled={kind === "category" ? !categoryValid : !totalValid}
          >
            {isUpdate ? "Save changes" : "Create budget"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <span className="font-medium text-neutral-800">Monthly cap:</span>{" "}
          {formatMinor(totalMonthlyMinor, baseCurrency)}
          {kind === "category" && (
            <>
              {" "}
              · <span className="font-medium text-neutral-800">Allocated:</span>{" "}
              {formatMinor(allocatedMinor, baseCurrency)}
              {" "}
              · <span className="font-medium text-neutral-800">Unallocated:</span>{" "}
              {formatMinor(Math.max(0, totalMonthlyMinor - allocatedMinor), baseCurrency)}
            </>
          )}
        </div>

        <div className="inline-flex w-full rounded-control border border-neutral-200 p-0.5">
          <KindTab
            active={kind === "category"}
            onClick={() => {
              setKind("category");
              setError(null);
            }}
            label="Category"
          />
          <KindTab
            active={kind === "total"}
            onClick={() => {
              setKind("total");
              setError(null);
            }}
            label="Total monthly"
          />
        </div>

        {kind === "category" && (
          <>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Category
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <CategoryPill
                    key={c.id}
                    category={c}
                    selected={categoryId === c.id}
                    onSelect={(id) => {
                      setCategoryId(id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
            </div>
            {selectedCategory && (
              <p className="flex items-center gap-2 text-sm text-neutral-500">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: selectedCategory.color }}
                >
                  <CategoryIcon name={selectedCategory.icon} size={14} />
                </span>
                {existingLimit !== null
                  ? `Updating the ${selectedCategory.name} budget.`
                  : `Set a monthly limit for ${selectedCategory.name}.`}
              </p>
            )}
          </>
        )}

        {kind === "total" && (
          <p className="text-sm text-neutral-500">
            Master cap for the month. Category budgets cannot add up to more than this amount.
          </p>
        )}

        <div>
          <label
            htmlFor="budget-limit"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-500"
          >
            Monthly limit ({baseCurrency})
          </label>
          <Input
            ref={limitRef}
            id="budget-limit"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setError(null);
            }}
          />
          {kind === "category" && categoryId && maxAllowedMinor >= 0 && (
            <p className="mt-1.5 text-xs text-neutral-500">
              Maximum for this category:{" "}
              <span className="font-medium text-neutral-700">
                {formatMinor(maxAllowedMinor, baseCurrency)}
              </span>
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function KindTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-neutral-900 text-white"
          : "text-neutral-600 hover:text-neutral-900")
      }
    >
      {label}
    </button>
  );
}
