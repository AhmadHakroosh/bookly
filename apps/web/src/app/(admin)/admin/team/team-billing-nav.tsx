import Link from "next/link";
import { cn } from "cn";

/**
 * Team & billing (`mocks.png` 07, decision D6): one place with two tabs. Billing exists on the
 * hosted service only; a self-hosted install has Team alone and shows no tabs.
 */
export function TeamBillingNav({ current }: { current: "team" | "billing" }) {
  const tabs = [
    ["team", "/admin/team", "Team members"],
    ["billing", "/admin/billing", "Billing"],
  ] as const;
  return (
    <nav aria-label="Team and billing" className="flex gap-1 border-b">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            current === key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
