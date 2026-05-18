// Modal form to add a new expense: amount, currency, category, date (with quick chips),
// note, payment method, tags. Closes on Escape, backdrop click, or after save.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
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
      setPaymentMethod("card");
      setTags([]);
      setTagDraft("");
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [open]);

  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && tagDraft.trim()) {
      e.preventDefault();
      const next = tagDraft.trim();
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
        <Field label="Amount">
          <div className="flex items-stretch overflow-hidden rounded-control border border-neutral-200 focus-within:border-accent dark:border-neutral-800">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="border-r border-neutral-200 bg-neutral-50 px-2 text-sm text-neutral-700 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              aria-label="Currency"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-white px-3 py-2 text-2xl font-medium tabular-nums text-neutral-900 placeholder:text-neutral-300 focus:outline-none dark:bg-neutral-900 dark:text-neutral-50 dark:placeholder:text-neutral-600"
            />
          </div>
        </Field>

        <Field label="Category">
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
        </Field>

        <Field label="Date">
          <div className="mb-2 flex gap-2">
            {[
              { label: "Today", value: today() },
              { label: "Yesterday", value: daysAgo(1) },
              { label: "2 days ago", value: daysAgo(2) },
            ].map((chip) => {
              const active = chip.value === date;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setDate(chip.value)}
                  className={
                    "rounded-control px-3 py-1.5 text-sm transition-colors " +
                    (active
                      ? "bg-accent text-white"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700")
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Note">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. lunch at Joe's)"
          />
        </Field>

        <Field label="Payment Method">
          <div className="grid grid-cols-4 gap-0 overflow-hidden rounded-control border border-neutral-200 dark:border-neutral-800">
            {PAYMENT_METHODS.map((m, idx) => {
              const active = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={
                    "py-2 text-sm transition-colors " +
                    (idx > 0 ? "border-l border-neutral-200 dark:border-neutral-800 " : "") +
                    (active
                      ? "bg-accent/10 font-medium text-accent"
                      : "bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800")
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-200 bg-white px-2 py-1.5 focus-within:border-accent dark:border-neutral-800 dark:bg-neutral-900">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs text-accent"
              >
                {t}
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
              placeholder={tags.length ? "" : "Add tag and press Enter"}
              className="flex-1 min-w-[120px] bg-transparent py-1 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-50 dark:placeholder:text-neutral-500"
            />
          </div>
        </Field>

        <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
          Tip: type "50 food lunch" to auto-parse
        </p>

        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      {children}
    </div>
  );
}
