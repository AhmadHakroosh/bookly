import { PageTabs } from "@/components/ui/page-tabs";

/**
 * Team & billing (`mocks.png` 07, decision D6): one place with two tabs. Billing exists on the
 * hosted service only; a self-hosted install has Team alone and shows no tabs.
 */
export function TeamBillingNav({ current }: { current: "team" | "billing" }) {
  return (
    <PageTabs
      label="Team and billing"
      items={[
        { href: "/admin/team", label: "Team members", active: current === "team" },
        { href: "/admin/billing", label: "Billing", active: current === "billing" },
      ]}
    />
  );
}
