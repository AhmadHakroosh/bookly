import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";

export type AvailabilityTab = "hours" | "overrides" | "priority" | "routing";

/**
 * Availability & routing (`mocks.png` 03): one place, four tabs. The first three are views of
 * the member's own schedule (`?tab=`, keeping `?schedule=`); Routing is the workspace's routing
 * forms at /admin/routing, which collaborators don't get.
 */
export function AvailabilityHeader({
  current,
  routing,
  schedule,
  actions,
}: {
  current: AvailabilityTab;
  /** The member may manage routing forms (not a collaborator). */
  routing: boolean;
  /** The schedule being shown, when it is not the default. */
  schedule?: string | null;
  actions?: ReactNode;
}) {
  const href = (tab: string | null) => {
    const q = new URLSearchParams();
    if (schedule) q.set("schedule", schedule);
    if (tab) q.set("tab", tab);
    const s = q.toString();
    return `/admin/availability${s ? `?${s}` : ""}`;
  };
  return (
    <PageHeader
      title="Availability & routing"
      description="Control when you're available and how bookings are routed."
      actions={actions}
    >
      <PageTabs
        label="Availability and routing"
        items={[
          { href: href(null), label: "Weekly hours", active: current === "hours" },
          { href: href("overrides"), label: "Date overrides", active: current === "overrides" },
          { href: href("priority"), label: "Priority rules", active: current === "priority" },
          ...(routing
            ? [{ href: "/admin/routing", label: "Routing", active: current === "routing" }]
            : []),
        ]}
      />
    </PageHeader>
  );
}
