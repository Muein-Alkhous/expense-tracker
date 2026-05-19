// App shell: persistent sidebar + content area, plus the global Add Expense modal.

import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AddExpenseModal from "@/components/AddExpenseModal";
import Dashboard from "@/pages/Dashboard";
import Expenses from "@/pages/Expenses";
import Categories from "@/pages/Categories";
import { useUi, type PageId } from "@/store/ui";

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: "Dashboard",
  expenses: "Expenses",
  categories: "Categories",
  budgets: "Budgets",
  reports: "Reports",
  settings: "Settings",
};

export default function App() {
  const currentPage = useUi((s) => s.currentPage);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
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
      <Sidebar activeId={currentPage} onNavigate={(id) => setCurrentPage(id as PageId)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={PAGE_TITLES[currentPage]}
          showPeriod={currentPage === "dashboard" || currentPage === "expenses"}
        />
        <main className="flex-1 overflow-y-auto">
          {currentPage === "dashboard" && <Dashboard />}
          {currentPage === "expenses" && <Expenses />}
          {currentPage === "categories" && <Categories />}
          {currentPage !== "dashboard" &&
            currentPage !== "expenses" &&
            currentPage !== "categories" && (
            <div className="p-8 text-sm text-neutral-500">
              {PAGE_TITLES[currentPage]} is coming soon.
            </div>
          )}
        </main>
      </div>
      <AddExpenseModal />
    </div>
  );
}
