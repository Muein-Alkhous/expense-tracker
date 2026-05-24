// Shown when some foreign expenses lack an FX rate for aggregation.

interface FxMissingBannerProps {
  count: number;
  baseCurrency: string;
}

export default function FxMissingBanner({ count, baseCurrency }: FxMissingBannerProps) {
  if (count <= 0) return null;

  const noun = count === 1 ? "expense" : "expenses";

  return (
    <div className="rounded-control border border-amber-200/80 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
      {count} {noun} excluded from totals — add FX rates for {baseCurrency}.
    </div>
  );
}
