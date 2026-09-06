// Top bar above each page: title, period selector, and a primary "Add Expense" action.

import PeriodSelector from "@/components/PeriodSelector";
import Button from "@/components/ui/Button";
import { useUi } from "@/store/ui";

interface TopBarProps {
  title: string;
  showPeriod?: boolean;
}

export default function TopBar({ title, showPeriod = false }: TopBarProps) {
  const openAddExpense = useUi((s) => s.openAddExpense);
  const dashboardPeriod = useUi((s) => s.dashboardPeriod);
  const setDashboardPeriod = useUi((s) => s.setDashboardPeriod);

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 sm:px-8 lg:static lg:bg-white lg:py-4 lg:dark:bg-neutral-900">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <h1 className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-50 sm:text-xl">
          {title}
        </h1>
        {showPeriod && (
          <PeriodSelector
            value={dashboardPeriod}
            onChange={setDashboardPeriod}
          />
        )}
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <Button onClick={openAddExpense}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Expense
        </Button>
      </div>
    </header>
  );
}
