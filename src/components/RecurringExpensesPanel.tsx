// Manage recurring expense rules and materialize due entries.

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { api, type NewRecurringRuleInput, type RecurringRule } from "@/lib/api";
import { isTauri } from "@/lib/tauriEnv";
import { formatMinor } from "@/lib/money";
import { useCategories } from "@/store/categories";
import { useExpenses } from "@/store/expenses";
import { useSettings } from "@/store/settings";

const FREQUENCIES = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
] as const;

export default function RecurringExpensesPanel() {
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const categories = useCategories((s) => s.items.filter((c) => c.is_active));
  const loadExpenses = useExpenses((s) => s.loadFromDb);

  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    amount: "",
    category_id: categories[0]?.id ?? "",
    frequency: "monthly" as string,
    start_date: new Date().toISOString().slice(0, 10),
  });

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setRules([]);
      return;
    }
    setRules(await api.listRecurringRules());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (categories[0] && !draft.category_id) {
      setDraft((d) => ({ ...d, category_id: categories[0].id }));
    }
  }, [categories, draft.category_id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!isTauri()) {
      setStatus("Recurring rules require the desktop app (Tauri).");
      return;
    }
    const amount = parseFloat(draft.amount);
    if (!draft.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      setStatus("Enter a title and valid amount.");
      return;
    }
    const input: NewRecurringRuleInput = {
      title: draft.title.trim(),
      amount_minor: Math.round(amount * 100),
      currency_code: baseCurrency,
      category_id: draft.category_id,
      frequency: draft.frequency,
      start_date: draft.start_date,
    };
    await api.createRecurringRule(input);
    setDraft({
      title: "",
      amount: "",
      category_id: categories[0]?.id ?? "",
      frequency: "monthly",
      start_date: new Date().toISOString().slice(0, 10),
    });
    setStatus("Rule added.");
    await refresh();
  }

  async function handleMaterialize() {
    if (!isTauri()) return;
    const result = await api.materializeRecurringDue();
    await loadExpenses();
    setStatus(
      result.created > 0
        ? `Created ${result.created} expense(s) from recurring rules.`
        : "No new recurring expenses were due.",
    );
    await refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this recurring rule?")) return;
    await api.deleteRecurringRule(id);
    await refresh();
  }

  if (!isTauri()) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Recurring rules are saved in SQLite when you run the desktop app (
        <code className="text-neutral-800 dark:text-neutral-200">npm run tauri dev</code>).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="rounded-card border border-neutral-200 p-4 space-y-3 dark:border-neutral-700">
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
            className="rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={draft.frequency}
            onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
            className="rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
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
        <Button type="submit">Add rule</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={() => void handleMaterialize()}>
          Generate due expenses now
        </Button>
      </div>

      {status && <p className="text-sm text-neutral-600 dark:text-neutral-400">{status}</p>}

      <ul className="divide-y divide-neutral-200 rounded-card border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
        {rules.filter((r) => !r.deleted_at).length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-neutral-500">No recurring rules yet.</li>
        )}
        {rules
          .filter((r) => !r.deleted_at)
          .map((r) => {
            const cat = categories.find((c) => c.id === r.category_id);
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
    </div>
  );
}
