import { SettingsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDaysIcon, ContactIcon, CreditCardIcon, HandshakeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationList, IntegrationRow } from "@/components/ui/integration-row";
import { paymentsConfigured, paymentsFor } from "@/server/payments";
import { isCloud } from "@/server/platform";
import { getCurrentWorkspace } from "@/server/workspace";
import { CrmDialog } from "./crm-dialog";

export const metadata = { title: "Integrations" };

/**
 * The services the whole workspace talks to (`mocks.png` 08): the CRM it mirrors to and where
 * payments go, each a row with its state and one action. Keys and webhooks are under API; each
 * member's own calendars and video tools are on their Calendars & conferencing page.
 */
async function IntegrationsPage() {
  const ws = await getCurrentWorkspace();
  if (!ws) return null;
  const crm = ws.settings.crm;
  const live = (p: "hubspot" | "pipedrive") => crm?.provider === p && !!crm.apiKey;
  const stripe = paymentsFor(ws);
  const cloud = isCloud();
  const stripeStatus = !paymentsConfigured()
    ? { label: "Not set up on this server", tone: "neutral" as const }
    : stripe.ok
      ? { label: "Connected", tone: "success" as const }
      : stripe.reason === "pending"
        ? { label: "Onboarding not finished", tone: "warning" as const }
        : stripe.reason === "plan"
          ? { label: "Not in your plan", tone: "neutral" as const }
          : { label: "Not connected", tone: "neutral" as const };
  return (
    <div className="max-w-3xl space-y-8">
      <section aria-labelledby="integrations-title" className="space-y-3">
        <h2 id="integrations-title" className="text-base font-semibold tracking-tight">
          Integrations
        </h2>
        <IntegrationList>
          <IntegrationRow
            icon={ContactIcon}
            name="HubSpot"
            detail="Sync contacts and activity"
            status={
              live("hubspot")
                ? { label: "Connected", tone: "success" }
                : { label: "Not connected", tone: "neutral" }
            }
            action={
              <CrmDialog
                provider="hubspot"
                connected={live("hubspot")}
                other={live("pipedrive")}
                companyDomain=""
              />
            }
          />
          <IntegrationRow
            icon={HandshakeIcon}
            name="Pipedrive"
            detail="Sync deals and contacts"
            status={
              live("pipedrive")
                ? { label: "Connected", tone: "success" }
                : { label: "Not connected", tone: "neutral" }
            }
            action={
              <CrmDialog
                provider="pipedrive"
                connected={live("pipedrive")}
                other={live("hubspot")}
                companyDomain={crm?.companyDomain ?? ""}
              />
            }
          />
          <IntegrationRow
            icon={CreditCardIcon}
            name="Stripe"
            detail={
              cloud || paymentsConfigured()
                ? "Process payments for paid bookings"
                : "Add STRIPE_SECRET_KEY on the server to take payments"
            }
            status={stripeStatus}
            action={
              cloud && paymentsConfigured() ? (
                stripe.ok || stripe.reason === "pending" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/admin/settings/payments" />}
                  >
                    Manage
                  </Button>
                ) : stripe.reason === "plan" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/admin/billing" />}
                  >
                    See plans
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/admin/settings/payments" />}
                  >
                    Connect
                  </Button>
                )
              ) : null
            }
          />
        </IntegrationList>
        <p className="text-xs text-muted-foreground">
          Tokens are stored encrypted and never shown again. Bookly mirrors to one CRM at a time.
        </p>
      </section>

      <section aria-labelledby="personal-title" className="space-y-3">
        <h2 id="personal-title" className="text-base font-semibold tracking-tight">
          Calendars and video
        </h2>
        <IntegrationList>
          <IntegrationRow
            icon={CalendarDaysIcon}
            name="Calendars & conferencing"
            detail="Each member connects their own calendar, Zoom and default video tool"
            action={
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href="/admin/calendars" />}
              >
                Open
              </Button>
            }
          />
        </IntegrationList>
      </section>
    </div>
  );
}

export default function IntegrationsPageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <IntegrationsPage />
    </Suspense>
  );
}
