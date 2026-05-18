// Modal form to add a new expense.
// Style matches the dark-mockup layout but rendered in light mode:
// minimal, no field labels, colored-border category pills, 3 payment methods.

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CategoryPill from "@/components/CategoryPill";
import { CATEGORIES, PAYMENT_METHODS, useExpenses } from "@/store/expenses";
import { useUi } from "@/store/ui";
import { today, daysAgo } from "@/lib/date";
import { toMinor } from "@/lib/money";
import type { PaymentMethod } from "@/types";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "JPY"] as const;

export default function AddExpenseModal() {
  const open = useUi((s) => s.addExpenseOpen);
  const close = useUi((s) => s.closeAddExpense);
  const addExpense = useExpenses((s) => s.addExpense);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("USD");
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES[0].id);
  const [date, setDate] = useState<string>(today());
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setCurrency("USD");
      setCategoryId(CATEGORIES[0].id);
      setDate(today());
      setNote("");
      setPaymentMethod("cash");
      setTags([]);
      setTagDraft("");
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [open]);

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
    addExpense({
      amount_minor: toMinor(value, currency),
      currency_code: currency,
      category_id: categoryId,
      date,
      note: note.trim() || undefined,
      payment_method: paymentMethod,
      tags: tags.length ? tags : undefined,
    });
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
      title="Add Expense"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => handleSave()}>
            Save Expense
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
          {CATEGORIES.map((c) => (
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
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200")
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
          className="w-full rounded-control border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-900 focus:border-accent focus:outline-none"
        />

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was this for?"
          className="w-full rounded-control border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none"
        />

        <div className="flex rounded-control bg-neutral-100 p-1">
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
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700")
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 focus-within:border-accent">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
            >
              #{t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="text-accent/70 hover:text-accent"
                aria-label={`Remove tag ${t}`}
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
            className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>

        <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
          Tip: type "50 food lunch" to auto-parse
        </p>

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
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    // Outer wrapper is the positioning context for the dropdown.
    // The inner row uses overflow-hidden so the inner button hover bg follows
    // the rounded corners; the dropdown is rendered OUTSIDE that row so it
    // is not clipped.
    <div ref={wrapperRef} className="relative">
      <div className="flex items-stretch overflow-hidden rounded-control border border-neutral-200 bg-neutral-50 focus-within:border-accent">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Currency"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 border-r border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
        >
          <span>{currency}</span>
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
            className="text-neutral-400"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <input
          ref={amountRef}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="flex-1 bg-transparent px-3 py-3 text-2xl font-medium tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {open && (
        <ul className="absolute left-0 top-full z-30 mt-1 min-w-[88px] overflow-hidden rounded-control border border-neutral-200 bg-white shadow-lg">
          {CURRENCIES.map((c) => {
            const active = c === currency;
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => {
                    onCurrencyChange(c);
                    setOpen(false);
                  }}
                  className={
                    "block w-full px-3 py-1.5 text-left text-sm transition-colors " +
                    (active
                      ? "bg-accent/10 text-accent"
                      : "text-neutral-700 hover:bg-neutral-50")
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
