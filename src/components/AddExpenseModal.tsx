// Modal form to add a new expense.
// Minimal layout: no field labels, colored-border category pills, 3 payment methods.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CategoryPill from "@/components/CategoryPill";
import { PAYMENT_METHODS, useExpenses } from "@/store/expenses";
import { useCategories } from "@/store/categories";
import { useUi } from "@/store/ui";
import { today, daysAgo } from "@/lib/date";
import { parseQuickAddText } from "@/lib/quickAddParser";
import { toMajor, toMinor } from "@/lib/money";
import { useSettings } from "@/store/settings";
import type { PaymentMethod } from "@/types";

import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const CURRENCIES = SUPPORTED_CURRENCIES;

const fieldClass =
  "w-full rounded-control border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Transfer",
  bank: "Bank",
  other: "Other",
};

export default function AddExpenseModal() {
  const open = useUi((s) => s.addExpenseOpen);
  const editingExpenseId = useUi((s) => s.editingExpenseId);
  const close = useUi((s) => s.closeAddExpense);
  const addExpense = useExpenses((s) => s.addExpense);
  const updateExpense = useExpenses((s) => s.updateExpense);
  const quickAddParser = useSettings((s) => s.quickAddParser);
  const defaultCurrency = useSettings((s) => s.baseCurrency);

  const allCategories = useCategories((s) => s.items);
  const categories = useMemo(() => {
    const active = allCategories.filter((c) => c.is_active);
    if (!editingExpenseId) return active;
    const exp = useExpenses.getState().items.find((e) => e.id === editingExpenseId);
    if (!exp) return active;
    const cur = allCategories.find((c) => c.id === exp.category_id);
    if (cur && !cur.is_active && !active.some((c) => c.id === cur.id)) {
      return [...active, cur];
    }
    return active;
  }, [allCategories, editingExpenseId]);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("USD");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState<string>(today());
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const active = useCategories.getState().items.filter((c) => c.is_active);

    if (editingExpenseId) {
      const exp = useExpenses.getState().items.find((e) => e.id === editingExpenseId);
      if (!exp || exp.deleted_at) {
        close();
        return;
      }
      setAmount(String(toMajor(exp.amount_minor, exp.currency_code)));
      setCurrency(exp.currency_code);
      const allCats = useCategories.getState().items;
      const catExists = allCats.some((c) => c.id === exp.category_id);
      setCategoryId(catExists ? exp.category_id : (active[0]?.id ?? ""));
      setDate(exp.date);
      setNote(exp.note ?? "");
      const pm = exp.payment_method ?? "cash";
      const known = PAYMENT_METHODS.some((m) => m.id === pm);
      setPaymentMethod(known ? pm : "other");
      setTags(exp.tags ?? []);
      setTagDraft("");
      setTimeout(() => amountRef.current?.focus(), 50);
      return;
    }

    setAmount("");
    setCurrency(defaultCurrency);
    setCategoryId(active[0]?.id ?? "");
    setDate(today());
    setNote("");
    setPaymentMethod("cash");
    setTags([]);
    setTagDraft("");
    setTimeout(() => amountRef.current?.focus(), 50);
  }, [open, editingExpenseId, defaultCurrency, close]);

  function applyQuickAdd(text: string) {
    if (!quickAddParser || !text.trim()) return;
    const parsed = parseQuickAddText(text);
    if (parsed.amount) setAmount(parsed.amount);
    if (parsed.date) setDate(parsed.date);
    if (parsed.note) {
      const parts = parsed.note.trim().split(/\s+/);
      const first = parts[0]?.toLowerCase();
      const cat = categories.find(
        (c) => c.id === first || c.name.toLowerCase() === first,
      );
      if (cat) {
        setCategoryId(cat.id);
        const rest = parts.slice(1).join(" ");
        setNote(rest || parsed.note);
      } else {
        setNote(parsed.note);
      }
    }
  }

  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && tagDraft.trim()) {
      e.preventDefault();
      const next = tagDraft.trim().replace(/^#/, "");
      if (!tags.includes(next)) setTags([...tags, next]);
      setTagDraft("");
    } else if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function handleSave(e?: FormEvent) {
    e?.preventDefault();
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      amountRef.current?.focus();
      return;
    }
    const payload = {
      amount_minor: toMinor(value, currency),
      currency_code: currency,
      category_id: categoryId,
      date,
      note: note.trim() || undefined,
      payment_method: paymentMethod,
      tags: tags.length ? tags : undefined,
    };

    if (editingExpenseId) {
      updateExpense(editingExpenseId, payload);
    } else {
      addExpense(payload);
    }
    close();
  }

  const dateChips = [
    { label: "Today", value: today() },
    { label: "Yesterday", value: daysAgo(1) },
    { label: "2 days ago", value: daysAgo(2) },
  ];

  return (
    <Modal
      open={open}
      onClose={close}
      title={editingExpenseId ? "Edit expense" : "Add Expense"}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => handleSave()}>
            {editingExpenseId ? "Save changes" : "Save Expense"}
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">
              ENTER
            </span>
          </Button>
        </>
      }
    >
      <form onSubmit={handleSave} className="space-y-5">
        <AmountField
          amount={amount}
          onAmountChange={setAmount}
          currency={currency}
          onCurrencyChange={setCurrency}
          amountRef={amountRef}
        />

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <CategoryPill
              key={c.id}
              category={c}
              selected={categoryId === c.id}
              onSelect={setCategoryId}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {dateChips.map((chip) => {
            const active = chip.value === date;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => setDate(chip.value)}
                className={
                  "rounded-control px-4 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-accent text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700")
                }
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={fieldClass}
        />

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={(e) => {
            if (!editingExpenseId) applyQuickAdd(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && quickAddParser && !editingExpenseId) {
              applyQuickAdd(note);
            }
          }}
          placeholder={quickAddParser ? 'e.g. "42.50 food lunch" or "15 transport"' : "What was this for?"}
          className={fieldClass}
        />

        <div className="flex rounded-control bg-neutral-100 p-1 dark:bg-neutral-800">
          {PAYMENT_METHODS.map((m) => {
            const active = paymentMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethod(m.id)}
                className={
                  "flex-1 rounded-control py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50 dark:shadow-none"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200")
                }
              >
                {PAYMENT_LABELS[m.id]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 focus-within:border-accent dark:border-neutral-700 dark:bg-neutral-800">
          {tags.map((tagName) => (
            <span
              key={tagName}
              className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
            >
              #{tagName}
              <button
                type="button"
                onClick={() => removeTag(tagName)}
                className="text-accent/70 hover:text-accent"
                aria-label={`Remove tag ${tagName}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagKey}
            placeholder={tags.length ? "" : "Add tags..."}
            className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-50 dark:placeholder:text-neutral-500"
          />
        </div>

        {quickAddParser && !editingExpenseId && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Tip: type &quot;50 food lunch&quot; in the note field, then press Enter or tab away
          </p>
        )}

        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

interface AmountFieldProps {
  amount: string;
  onAmountChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  amountRef: React.RefObject<HTMLInputElement>;
}

function AmountField({
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  amountRef,
}: AmountFieldProps) {
  /** Dropdown open — named to avoid confusing with Modal `open` (same-file scope). */
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setCurrencyMenuOpen(false);
      }
    }
    if (currencyMenuOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [currencyMenuOpen]);

  return (
    // Outer wrapper is the positioning context for the dropdown.
    // Inner row uses `grid` (not flex) so the amount field can never repaint on top of
    // the currency control — on some browsers `type="number"` focus/spinner repaint
    // briefly covered the sibling and looked like disappearing text.
    <div ref={wrapperRef} className="relative">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-control border border-neutral-200 bg-neutral-50 focus-within:border-accent dark:border-neutral-700 dark:bg-neutral-800 dark:focus-within:border-accent">
        <div className="relative z-10 flex items-stretch border-r border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setCurrencyMenuOpen((v) => !v)}
            aria-label={`Currency, ${currency}`}
            aria-expanded={currencyMenuOpen}
            className="inline-flex min-w-[5rem] items-center justify-start gap-1.5 px-3 py-2 text-start text-sm font-semibold tracking-wide text-neutral-900 hover:bg-neutral-100 dark:text-neutral-50 dark:hover:bg-neutral-700"
          >
            {/* Plain sans text — monospace font loading flicker ruled out */}
            <span className="min-w-[2.75rem] shrink-0 font-sans tabular-nums">
              {currency}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-neutral-400"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <input
          ref={amountRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="col-start-2 min-h-[3.25rem] min-w-0 bg-transparent px-3 py-3 text-2xl font-medium tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-50 dark:placeholder:text-neutral-500"
        />
      </div>
      {currencyMenuOpen && (
        <ul className="absolute start-0 top-full z-30 mt-1 min-w-[88px] overflow-hidden rounded-control border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {CURRENCIES.map((c) => {
            const active = c === currency;
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => {
                    onCurrencyChange(c);
                    setCurrencyMenuOpen(false);
                  }}
                  className={
                    "block w-full px-3 py-1.5 text-start text-sm transition-colors " +
                    (active
                      ? "bg-accent/10 text-accent"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700")
                  }
                >
                  {c}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
