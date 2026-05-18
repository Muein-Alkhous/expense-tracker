// iOS-style pill toggle used in settings and category rows.

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
        (checked ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-700")
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
          (checked ? "translate-x-[18px]" : "translate-x-[2px]")
        }
      />
    </button>
  );
}
