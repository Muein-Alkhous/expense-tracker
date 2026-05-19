// Top bar above each page: title, period selector, and a primary "Add Expense" action.

import { useTranslation } from "react-i18next";
import PeriodSelector from "@/components/PeriodSelector";
import Button from "@/components/ui/Button";
import { useUi } from "@/store/ui";

interface TopBarProps {
  title: string;
  showPeriod?: boolean;
}

export default function TopBar({ title, showPeriod = false }: TopBarProps) {
  const { t } = useTranslation();
  const openAddExpense = useUi((s) => s.openAddExpense);
  const dashboardPeriod = useUi((s) => s.dashboardPeriod);
  const setDashboardPeriod = useUi((s) => s.setDashboardPeriod);

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-8 py-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        {showPeriod && (
          <PeriodSelector
            value={dashboardPeriod}
            onChange={setDashboardPeriod}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
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
