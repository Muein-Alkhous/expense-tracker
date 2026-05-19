// Top bar above each page: title, period selector, and a primary "Add Expense" action.

import { useTranslation } from "react-i18next";
import Button from "@/components/ui/Button";
import { useUi } from "@/store/ui";

interface TopBarProps {
  title: string;
  period?: string;
  showPeriod?: boolean;
}

export default function TopBar({ title, period = "This month", showPeriod = true }: TopBarProps) {
  const { t } = useTranslation();
  const openAddExpense = useUi((s) => s.openAddExpense);

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-8 py-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        {showPeriod && (
          <button className="inline-flex items-center gap-2 rounded-control border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {period}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* <button
          aria-label="Search"
          className="rounded-control p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button> */}
        <Button onClick={openAddExpense}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("actions.addExpense")}
        </Button>
      </div>
    </header>
  );
}
