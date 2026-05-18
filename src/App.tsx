// App shell: persistent sidebar + content area, plus the global Add Expense modal.

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AddExpenseModal from "@/components/AddExpenseModal";
import Dashboard from "@/pages/Dashboard";
import { useUi } from "@/store/ui";

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  expenses: "Expenses",
  categories: "Categories",
  budgets: "Budgets",
  reports: "Reports",
  settings: "Settings",
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const openAddExpense = useUi((s) => s.openAddExpense);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openAddExpense();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAddExpense]);

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Sidebar activeId={active} onNavigate={setActive} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={PAGE_TITLES[active] ?? "Expense Tracker"} />
        <main className="flex-1 overflow-y-auto">
          {active === "dashboard" ? (
            <Dashboard />
          ) : (
            <div className="p-8 text-sm text-neutral-500">
              {PAGE_TITLES[active]} is coming soon.
            </div>
          )}
        </main>
      </div>
      <AddExpenseModal />
    </div>
  );
}
