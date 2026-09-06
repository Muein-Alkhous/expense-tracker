import { useState } from "react";
import {
  BarChart3,
  ChartPie,
  LayoutDashboard,
  List,
  MoreHorizontal,
  Plus,
  Settings,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useUi, type PageId } from "@/store/ui";

const primaryItems: Array<{
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "expenses", label: "Expenses", icon: List },
  { id: "budgets", label: "Budgets", icon: ChartPie },
];

const moreItems: Array<{
  id: PageId;
  label: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  { id: "reports", label: "Reports", description: "Charts and spending trends", icon: BarChart3 },
  { id: "categories", label: "Categories", description: "Organize your expenses", icon: Tags },
  { id: "trash", label: "Trash", description: "Restore deleted records", icon: Trash2 },
  { id: "settings", label: "Settings", description: "Currency, theme, and backup", icon: Settings },
];

export default function MobileNav() {
  const currentPage = useUi((state) => state.currentPage);
  const setCurrentPage = useUi((state) => state.setCurrentPage);
  const openAddExpense = useUi((state) => state.openAddExpense);
  const [moreOpen, setMoreOpen] = useState(false);
  const secondaryActive = moreItems.some((item) => item.id === currentPage);

  function navigate(page: PageId) {
    setCurrentPage(page);
    setMoreOpen(false);
  }

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMoreOpen(false)}>
          <section
            aria-label="More navigation"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:bg-neutral-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">More</h2>
              <button
                type="button"
                aria-label="Close more menu"
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-2 text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className="rounded-xl border border-neutral-200 p-4 text-start active:bg-neutral-50 dark:border-neutral-700 dark:active:bg-neutral-800"
                  >
                    <Icon size={20} className="mb-3 text-accent" />
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs text-neutral-500">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-neutral-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 lg:hidden"
      >
        {primaryItems.slice(0, 2).map((item) => (
          <NavButton key={item.id} item={item} active={currentPage === item.id} onClick={() => navigate(item.id)} />
        ))}
        <button
          type="button"
          aria-label="Add expense"
          onClick={openAddExpense}
          className="mx-auto -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-indigo-500/30 active:scale-95"
        >
          <Plus size={26} />
        </button>
        <NavButton
          item={primaryItems[2]!}
          active={currentPage === primaryItems[2]!.id}
          onClick={() => navigate(primaryItems[2]!.id)}
        />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
            secondaryActive ? "text-accent" : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          <MoreHorizontal size={21} />
          More
        </button>
      </nav>
    </>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof primaryItems)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
        active ? "text-accent" : "text-neutral-500 dark:text-neutral-400"
      }`}
    >
      <Icon size={21} />
      {item.label}
    </button>
  );
}
