// Print-friendly monthly expense statement (hidden iframe + system print dialog).

import dayjs from "dayjs";
import { formatDate } from "@/lib/date";
import { formatMinor } from "@/lib/money";
import { getCategory } from "@/store/expenses";
import type { Expense } from "@/types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PrintStatementOptions {
  /** e.g. "May 2026" — defaults to current calendar month */
  periodLabel?: string;
  baseCurrency: string;
}

/**
 * Generates a simple HTML statement for the given expenses (typically “this month”),
 * prints it via a hidden iframe (avoids `window.open` + `noopener`, which returns `null`
 * while still opening a blank window — so nothing could be written to it).
 */
export function printMonthlyStatement(
  expenses: Expense[],
  options: PrintStatementOptions,
): void {
  const period =
    options.periodLabel ?? dayjs().format("MMMM YYYY");

  const sorted = [...expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
  const base = options.baseCurrency;
  const inBase = sorted.filter((e) => e.currency_code === base);
  const totalMinorBase = inBase.reduce((acc, e) => acc + e.amount_minor, 0);
  const otherCurrencyCount = sorted.length - inBase.length;

  const rows = sorted
    .map((e) => {
      const cat = getCategory(e.category_id);
      const categoryName = escapeHtml(cat?.name ?? e.category_id);
      const note = escapeHtml(e.note?.trim() || "—");
      const method = escapeHtml(
        (e.payment_method ?? "—").replace(/^\w/, (c) => c.toUpperCase()),
      );
      const dateStr = formatDate(e.date, "MMM D, YYYY");
      const amount = formatMinor(e.amount_minor, e.currency_code);
      return `<tr>
        <td>${escapeHtml(dateStr)}</td>
        <td>${categoryName}</td>
        <td>${note}</td>
        <td>${method}</td>
        <td class="num">${escapeHtml(amount)}</td>
      </tr>`;
    })
    .join("");

  const totalFormatted = formatMinor(totalMinorBase, base);
  const totalLine =
    otherCurrencyCount > 0
      ? `Total in ${escapeHtml(base)}: <strong>${escapeHtml(
          totalFormatted,
        )}</strong> (${inBase.length} of ${sorted.length} expenses in ${escapeHtml(
          base,
        )}). Other rows list amounts in their own currency.`
      : `Total: <strong>${escapeHtml(totalFormatted)}</strong> (${sorted.length} expense${
          sorted.length === 1 ? "" : "s"
        }).`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Expense statement — ${escapeHtml(period)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
    .meta { color: #555; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .total { font-size: 1rem; margin-bottom: 1rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    th, td { text-align: left; padding: 0.5rem 0.4rem; border-bottom: 1px solid #ddd; vertical-align: top; }
    th { font-weight: 600; border-bottom: 2px solid #333; }
    .num { text-align: right; white-space: nowrap; }
    @media print {
      body { margin: 0.5in; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <h1>Expense Tracker</h1>
  <p class="meta">Statement period: <strong>${escapeHtml(period)}</strong> · Generated ${escapeHtml(
    dayjs().format("MMM D, YYYY h:mm A"),
  )}</p>
  <p class="total">${totalLine}</p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Note</th>
        <th>Payment</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="5">No transactions in this period.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Print statement");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;margin:0;padding:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const printWin = iframe.contentWindow;
  const printDoc = iframe.contentDocument;
  if (!printWin || !printDoc) {
    iframe.remove();
    window.alert(
      "Print isn’t available in this view. Try opening the app in your browser, or use Download CSV to export your data.",
    );
    return;
  }

  let leakGuard: ReturnType<typeof window.setTimeout> | undefined;
  let cleanedUp = false;
  const removeIframe = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (leakGuard !== undefined) window.clearTimeout(leakGuard);
    printWin.removeEventListener("afterprint", removeIframe);
    iframe.remove();
  };

  printWin.addEventListener("afterprint", removeIframe);
  leakGuard = window.setTimeout(removeIframe, 120_000);

  printDoc.open();
  printDoc.write(html);
  printDoc.close();

  printWin.setTimeout(() => {
    try {
      printWin.focus();
      printWin.print();
    } catch {
      removeIframe();
      window.alert(
        "Print failed. Use Download CSV to export your data, or try from a regular browser window.",
      );
    }
  }, 150);
}
