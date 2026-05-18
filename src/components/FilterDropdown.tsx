// Compact filter dropdown button used on the Expenses page filter bar.

import { useEffect, useRef, useState } from "react";

export interface FilterOption {
  id: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  options: FilterOption[];
  onChange: (id: string) => void;
}

export default function FilterDropdown({ value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
      >
        {current.label}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[160px] overflow-hidden rounded-control border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          {options.map((o) => {
            const active = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={
                  "block w-full px-3 py-2 text-left text-sm transition-colors " +
                  (active
                    ? "bg-accent/10 text-accent"
                    : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800")
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
