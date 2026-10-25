import { Progress } from "@/components/ui/progress";

/**
 * A plan limit and how much of it is used (`mocks.png` 07: "Team members 3 of 5", "Bookings this
 * month 128 of 500"). The bar turns orange at the limit. `limit: null` means unlimited.
 */
function UsageBar({
  label,
  used,
  limit,
  className,
}: {
  label: string;
  used: number;
  limit: number | null;
  className?: string;
}) {
  const text = limit === null ? `${used} (no limit)` : `${used} of ${limit}`;
  return (
    <Progress
      label={label}
      value={limit === null ? null : Math.min(used, limit)}
      max={limit ?? 100}
      valueText={text}
      showValue
      tone={limit !== null && used >= limit ? "warning" : "brand"}
      className={className}
    />
  );
}

export { UsageBar };
