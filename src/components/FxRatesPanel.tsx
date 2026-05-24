// Settings panel: view, add, import, and refresh FX rates.

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatRatePair, parseFxCsv } from "@/lib/fx";
import { toDateKey } from "@/lib/date";
import { useFxRates } from "@/store/fxRates";
import { useSettings } from "@/store/settings";

export default function FxRatesPanel() {
  const baseCurrency = useSettings((s) => s.baseCurrency);
  const rates = useFxRates((s) => s.rates);
  const addRate = useFxRates((s) => s.addRate);
  const removeRate = useFxRates((s) => s.removeRate);
  const importRates = useFxRates((s) => s.importRates);
  const fetchLatest = useFxRates((s) => s.fetchLatest);
  const seedDefaultsIfEmpty = useFxRates((s) => s.seedDefaultsIfEmpty);

  const fileRef = useRef<HTMLInputElement>(null);
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState(baseCurrency);
  const [rate, setRate] = useState("1.08");
  const [asOf, setAsOf] = useState(toDateKey(new Date().toISOString()));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...rates].sort(
    (a, b) =>
      b.as_of_date.localeCompare(a.as_of_date) ||
      a.from_code.localeCompare(b.from_code),
  );

  function handleAdd() {
    if (from.toUpperCase() === to.toUpperCase()) {
      setStatus("Choose two different currencies.");
      return;
    }
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Enter a valid positive rate.");
      return;
    }
    addRate({
      from_code: from.toUpperCase(),
      to_code: to.toUpperCase(),
      rate: n,
      as_of_date: asOf,
    });
    setStatus("Bidirectional rate added.");
  }

  async function handleFetch() {
    setBusy(true);
    setStatus(null);
    try {
      const { added, skipped } = await fetchLatest(baseCurrency);
      if (added === 0) {
        setStatus("No rates returned. Add rates manually or try again later.");
      } else {
        const skipNote =
          skipped.length > 0 ? ` (${skipped.join(", ")} not available from API)` : "";
        setStatus(`Updated ${added} bidirectional pair(s) from ECB feed.${skipNote}`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not fetch rates.");
    } finally {
      setBusy(false);
    }
  }

  function handleCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseFxCsv(text);
      if (rows.length === 0) {
        setStatus("No valid rows in CSV. Use: from,to,rate,date");
        return;
      }
      importRates(rows);
      setStatus(`Imported ${rows.length} bidirectional rate row(s).`);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-5">
      <p
        className="text-sm text-neutral-600 dark:text-neutral-400"
        dangerouslySetInnerHTML={{
          __html: `Expenses keep their original currency. Totals and charts convert to <strong>${baseCurrency}</strong> using the rate on or before each expense date.`,
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={() => seedDefaultsIfEmpty()}>
          Load sample rates
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleFetch()}>
          {busy ? "Fetching…" : "Fetch latest rates"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>
          Import CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCsv(f);
            e.target.value = "";
          }}
        />
      </div>

      <p
        className="text-xs text-neutral-500 dark:text-neutral-500"
        dangerouslySetInnerHTML={{
          __html: 'CSV columns: <code>from,to,rate,date</code> (date optional). Example: <code>EUR,USD,1.08,2026-05-19</code>',
        }}
      />

      <div className="rounded-card border border-neutral-200 p-4 dark:border-neutral-700">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Add rate
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-control border border-neutral-200 bg-white px-2 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-control border border-neutral-200 bg-white px-2 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Rate"
            className="text-sm"
          />
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="text-sm"
          />
        </div>
        <Button type="button" className="mt-3" onClick={handleAdd}>
          Add rate
        </Button>
      </div>

      {status && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{status}</p>
      )}

      <div className="max-h-64 overflow-auto rounded-card border border-neutral-200 dark:border-neutral-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50 text-start text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2">Pair</th>
              <th className="px-3 py-2">As of</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                  No rates yet. Load samples or fetch latest.
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr
                key={r.id}
                className="border-t border-neutral-100 dark:border-neutral-800"
              >
                <td className="px-3 py-2 text-neutral-800 dark:text-neutral-200">
                  <div className="font-medium">{r.from_code} ↔ {r.to_code}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatRatePair(r.from_code, r.to_code, r.rate)}
                  </div>
                </td>
                <td className="px-3 py-2 text-neutral-500">{r.as_of_date}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRate(r.id)}
                    className="text-xs text-neutral-400 hover:text-rose-500"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
