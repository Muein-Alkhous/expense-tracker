// App shell: persistent sidebar + content area, plus the global Add Expense modal.

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/Sidebar";
import { useSettingsSync } from "@/hooks/useSettingsSync";
import TopBar from "@/components/TopBar";
import AddExpenseModal from "@/components/AddExpenseModal";
import NewBudgetModal from "@/components/NewBudgetModal";
import ExportCsvModal from "@/components/ExportCsvModal";
import Dashboard from "@/pages/Dashboard";
import Expenses from "@/pages/Expenses";
import Categories from "@/pages/Categories";
import Budgets from "@/pages/Budgets";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import { useUi, type PageId } from "@/store/ui";

export default function App() {
  useSettingsSync();
  const { t } = useTranslation();
  const currentPage = useUi((s) => s.currentPage);
  const setCurrentPage = useUi((s) => s.setCurrentPage);
  const openAddExpense = useUi((s) => s.openAddExpense);

  const pageTitle = t(`nav.${currentPage}`);

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
          title={pageTitle}
          showPeriod={currentPage === "dashboard"}
        />
        <main className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
          {currentPage === "dashboard" && <Dashboard />}
          {currentPage === "expenses" && <Expenses />}
          {currentPage === "categories" && <Categories />}
          {currentPage === "budgets" && <Budgets />}
          {currentPage === "reports" && <Reports />}
          {currentPage === "settings" && <Settings />}
        </main>
      </div>
      <AddExpenseModal />
      <NewBudgetModal />
      <ExportCsvModal />
    </div>
  );
}
