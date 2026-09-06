// Centered modal dialog primitive with a dimmed backdrop and escape-to-close.

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = "w-[480px]",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${widthClass} flex max-h-[calc(100dvh-0.75rem)] max-w-full flex-col rounded-t-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-[calc(100vw-2rem)] sm:rounded-xl`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4 dark:border-neutral-800 sm:px-6">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              {title}
            </h2>
            <button
              aria-label="Close"
              onClick={onClose}
              className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-neutral-800 sm:px-6 sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
