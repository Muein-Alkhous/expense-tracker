// Manage recurring expense rules and materialize due entries.

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { api, type NewRecurringRuleInput, type RecurringRule } from "@/lib/api";
import { activeExpenses } from "@/lib/expenseFilters";
import { isTauri } from "@/lib/tauriEnv";
import { formatMinor, toMinor } from "@/lib/money";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useSettings } from "@/store/settings";

const FREQUENCIES = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
] as const;

export default function RecurringExpensesPanel() {
  const inTauri = isTauri();
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const categoryItems = useCategories((s) => s.items);
  const expenseItems = useExpenses((s) => s.items);
  const loadExpenses = useExpenses((s) => s.loadFromDb);

  const activeCategories = useMemo(
    () => categoryItems.filter((c) => c.is_active !== false),
    [categoryItems],
  );

  const flaggedRecurring = useMemo(
    () => activeExpenses(expenseItems).filter((e) => e.is_recurring),
    [expenseItems],
  );

  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(inTauri);
  const [status, setStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    amount: "",
    category_id: "",
    frequency: "monthly" as string,
    start_date: new Date().toISOString().slice(0, 10),
  });

  const refresh = useCallback(async () => {
    if (!inTauri) {
      setRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await api.listRecurringRules();
      setRules(Array.isArray(list) ? list : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load recurring rules.");
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [inTauri]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const firstId = activeCategories[0]?.id;
    if (!firstId) return;
    setDraft((d) => (d.category_id ? d : { ...d, category_id: firstId }));
  }, [activeCategories]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!inTauri) {
      setStatus("Recurring rules require the desktop app (Tauri).");
      return;
    }
    const amount = parseFloat(draft.amount);
    if (!draft.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      setStatus("Enter a title and valid amount.");
      return;
    }
    if (!draft.category_id) {
      setStatus("Add at least one category first.");
      return;
    }
    const input: NewRecurringRuleInput = {
      title: draft.title.trim(),
      amount_minor: toMinor(amount, baseCurrency),
      currency_code: baseCurrency,
      category_id: draft.category_id,
      frequency: draft.frequency,
      start_date: draft.start_date,
    };
    try {
      await api.createRecurringRule(input);
      setDraft({
        title: "",
        amount: "",
        category_id: activeCategories[0]?.id ?? "",
        frequency: "monthly",
        start_date: new Date().toISOString().slice(0, 10),
      });
      setStatus("Rule added.");
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not add rule.");
    }
  }

  async function handleMaterialize() {
    if (!inTauri) return;
    try {
      const result = await api.materializeRecurringDue();
      await loadExpenses();
      setStatus(
        result.created > 0
          ? `Created ${result.created} expense(s) from recurring rules.`
          : "No new recurring expenses were due.",
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not generate expenses.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this recurring rule?")) return;
    try {
      await api.deleteRecurringRule(id);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not delete rule.");
    }
  }

  if (!inTauri) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Recurring <strong>rules</strong> (scheduled generation) are saved in SQLite when you run
          the desktop app (
          <code className="text-neutral-800 dark:text-neutral-200">npm run tauri dev</code>
          ).
        </p>
        {flaggedRecurring.length > 0 ? (
          <div className="rounded-card border border-neutral-200 dark:border-neutral-700">
            <p className="border-b border-neutral-200 px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:border-neutral-700">
              Expenses marked recurring (browser data)
            </p>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {flaggedRecurring.map((e) => (
                <li key={e.id} className="px-4 py-3 text-sm">
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">
                    {e.note || "Expense"}
                  </span>
                  <span className="ml-2 text-neutral-500">
                    {formatMinor(e.amount_minor, e.currency_code)} · {e.date}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No expenses are marked as recurring yet.</p>
        )}
      </div>
    );
  }

  const activeRules = rules.filter((r) => !r.deleted_at);

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
          {loadError}
        </p>
      )}

      {activeCategories.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Add a category before creating recurring rules.
        </p>
      )}

      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-card border border-neutral-200 p-4 dark:border-neutral-700"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">New rule</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Title (e.g. Netflix)"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <Input
            placeholder="Amount"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
          <select
            value={draft.category_id}
            onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
            disabled={activeCategories.length === 0}
            className="rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {activeCategories.length === 0 ? (
              <option value="">No categories</option>
            ) : (
              activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <select
            value={draft.frequency}
            onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
            className="rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={draft.start_date}
            onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={activeCategories.length === 0}>
          Add rule
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={() => void handleMaterialize()}>
          Generate due expenses now
        </Button>
      </div>

      {status && <p className="text-sm text-neutral-600 dark:text-neutral-400">{status}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading rules…</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-card border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
          {activeRules.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-neutral-500">No recurring rules yet.</li>
          )}
          {activeRules.map((r) => {
            const cat = activeCategories.find((c) => c.id === r.category_id);
            return (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-50">{r.title}</p>
                  <p className="text-xs text-neutral-500">
                    {formatMinor(r.amount_minor, r.currency_code)} · {cat?.name ?? r.category_id} ·{" "}
                    {r.frequency}
                    {r.last_generated_date ? ` · last: ${r.last_generated_date}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(r.id)}
                  className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
