/**
 * One skeleton per route, each shaped like the page it stands in for: the same container
 * width, the same headings, and the same kind of content (list, table, form, calendar) in
 * the same place. Pages render these as their Suspense fallback while data streams in.
 */
import {
  Avatar,
  Button,
  Card,
  CardList,
  Details,
  DividedList,
  Field,
  FieldGrid,
  Form,
  FormCard,
  Heading,
  HeadingWithAction,
  Line,
  MonthGrid,
  Prose,
  PublicFrame,
  Shell,
  SlotGrid,
  Stats,
  Subheading,
  Table,
  Toolbar,
  WeekRows,
} from "./primitives";
import { Skeleton } from "@/components/ui/skeleton";

/* ---------------- Admin ---------------- */

export function InboxSkeleton() {
  return (
    <Shell className="space-y-8">
      <Heading width="w-24" />
      <section className="space-y-3">
        <Subheading width="w-24" />
        <DividedList rows={3} />
      </section>
      <section className="space-y-3">
        <Subheading width="w-16" />
        <DividedList rows={3} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <Subheading width="w-24" />
          <DividedList rows={3} />
        </section>
        <section className="space-y-3">
          <Subheading width="w-28" />
          <DividedList rows={3} />
        </section>
      </div>
    </Shell>
  );
}

export function BookingsSkeleton() {
  return (
    <Shell className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Heading width="w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      <CardList rows={4} height="h-24" />
    </Shell>
  );
}

export function BookingBriefSkeleton() {
  return (
    <Shell className="max-w-2xl space-y-6">
      <Heading width="w-72" eyebrow />
      <Card height="h-40" />
      <Details rows={4} />
    </Shell>
  );
}

export function EventTypesSkeleton() {
  return (
    <Shell className="space-y-6">
      <HeadingWithAction width="w-36" />
      <CardList rows={3} height="h-16" gap="space-y-2" />
    </Shell>
  );
}

export function EventTypeEditorSkeleton() {
  return (
    <Shell className="max-w-3xl space-y-8">
      <Heading width="w-64" eyebrow sub={false} />
      <div className="grid gap-6 sm:grid-cols-[1fr_200px]">
        <Field label="w-12" />
        <Field label="w-16" />
      </div>
      <Field label="w-24" rows={4} />
      <FieldGrid cols={3} />
      <FieldGrid cols={2} />
      <Field label="w-28" />
      <div className="space-y-3 rounded-lg border p-4">
        <Line width="w-40" />
        <Line width="w-80" className="h-3" />
      </div>
      <FieldGrid cols={4} />
      <Card height="h-24" />
      <Button />
    </Shell>
  );
}

export function AvailabilitySkeleton() {
  return (
    <Shell className="max-w-2xl space-y-10">
      <Heading width="w-32" />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-56 rounded-lg" />
        </div>
        <Line width="w-96" className="h-3" />
      </section>
      <div className="space-y-6">
        <FieldGrid cols={2} labels={["w-28", "w-40"]} />
        <WeekRows />
        <Button width="w-36" />
      </div>
      <section className="space-y-3">
        <Subheading width="w-32" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <Line width="w-32" />
      </section>
    </Shell>
  );
}

export function ContactsSkeleton() {
  return (
    <Shell className="space-y-6">
      <Heading width="w-32" />
      <Toolbar buttons={2} />
      <DividedList rows={6} />
    </Shell>
  );
}

export function ContactSkeleton() {
  return (
    <Shell className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Heading width="w-56" eyebrow />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="space-y-6">
          <div className="space-y-2">
            <Subheading width="w-24" />
            <DividedList rows={2} />
          </div>
          <div className="space-y-3">
            <Subheading width="w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Line width={i % 2 ? "w-72" : "w-56"} />
                  <Line width="w-24" className="h-3" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <aside className="space-y-4">
          <Card height="h-16" />
          <Card height="h-24" />
          <Card height="h-16" />
        </aside>
      </div>
    </Shell>
  );
}

export function RoutingFormsSkeleton() {
  return (
    <Shell className="space-y-6">
      <HeadingWithAction width="w-40" />
      <CardList rows={2} height="h-16" gap="space-y-2" />
    </Shell>
  );
}

export function RoutingEditorSkeleton() {
  return (
    <Shell className="max-w-3xl space-y-8">
      <Heading width="w-56" eyebrow sub={false} />
      <div className="grid gap-6 sm:grid-cols-[1fr_200px]">
        <Field label="w-12" />
        <Field label="w-16" />
      </div>
      <Field label="w-24" rows={4} />
      <Card height="h-40" />
      <Card height="h-40" />
      <Field label="w-20" />
      <Button />
    </Shell>
  );
}

export function ApiSkeleton() {
  return (
    <Shell className="space-y-8">
      <Heading width="w-48" />
      <section className="space-y-4">
        <Subheading width="w-24" />
        <Toolbar buttons={1} />
        <Table rows={2} cols={5} />
      </section>
      <section className="space-y-4">
        <Subheading width="w-24" />
        <Toolbar buttons={1} />
        <Table rows={2} cols={4} />
      </section>
    </Shell>
  );
}

export function BillingSkeleton() {
  return (
    <Shell className="max-w-3xl space-y-8">
      <Heading width="w-24" />
      <Card height="h-12" />
      <section className="space-y-2">
        <Subheading width="w-16" />
        <DividedList rows={3} lines={1} />
      </section>
      <section className="space-y-3">
        <Subheading width="w-16" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-xl border p-5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-20" />
              <Line width="w-full" className="h-3" />
              <Line width="w-5/6" className="h-3" />
              <Button full />
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

export function CalendarsSkeleton() {
  return (
    <Shell className="max-w-2xl space-y-6">
      <Heading width="w-32" />
      <Card height="h-24" />
      <Card height="h-24" />
    </Shell>
  );
}

export function ConferencingSkeleton() {
  return (
    <Shell className="max-w-2xl space-y-6">
      <Heading width="w-36" />
      <DividedList rows={4} />
    </Shell>
  );
}

export function DomainsSkeleton() {
  return (
    <Shell className="max-w-3xl space-y-8">
      <Heading width="w-28" />
      <Toolbar buttons={1} />
      <DividedList rows={2} />
    </Shell>
  );
}

export function NotificationsSkeleton() {
  return (
    <Shell className="max-w-2xl space-y-10">
      <Heading width="w-36" />
      <FormCard fields={2} />
      <FormCard fields={2} />
      <FormCard fields={1} />
    </Shell>
  );
}

export function ProfileSkeleton() {
  return (
    <Shell className="max-w-xl space-y-6">
      <Heading width="w-44" />
      <div className="space-y-4">
        <Field label="w-20" />
        <Field label="w-28" />
        <Field label="w-12" rows={4} />
        <Field label="w-24" />
        <Field label="w-24" />
        <Button full />
      </div>
      <div className="space-y-3 rounded-xl border p-4">
        <Skeleton className="h-5 w-32" />
        <Line width="w-80" className="h-3" />
        <DividedList rows={3} lines={1} />
      </div>
      <FormCard fields={3} />
    </Shell>
  );
}

export function SettingsSkeleton() {
  return (
    <Shell className="max-w-xl space-y-6">
      <Heading width="w-24" />
      <div className="space-y-4">
        <Field label="w-16" />
        <Field label="w-24" rows={4} />
        <FieldGrid cols={2} />
        <Field label="w-32" />
        <Field label="w-28" rows={4} />
        <Field label="w-24" />
        <Field label="w-20" />
        <Button />
      </div>
      <div className="space-y-3 border-t pt-6">
        <Skeleton className="h-6 w-24" />
        <Card height="h-20" title={false} />
      </div>
    </Shell>
  );
}

export function TeamSkeleton() {
  return (
    <Shell className="max-w-3xl space-y-8">
      <Heading width="w-20" />
      <Toolbar buttons={2} />
      <DividedList rows={3} avatar />
    </Shell>
  );
}

/* ---------------- Operator console ---------------- */

export function ConsoleSkeleton() {
  return (
    <Shell className="space-y-6">
      <Stats n={6} cols="sm:grid-cols-2 lg:grid-cols-6" />
      <Toolbar buttons={2} />
      <DividedList rows={6} />
    </Shell>
  );
}

export function ConsoleWorkspaceSkeleton() {
  return (
    <Shell className="space-y-6">
      <Heading width="w-56" size="h-6" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Details rows={6} />
        <Details rows={6} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card height="h-32" />
        <Card height="h-32" />
      </div>
      <Card height="h-28" />
    </Shell>
  );
}

export function ConsoleUsersSkeleton() {
  return (
    <Shell className="space-y-6">
      <Toolbar buttons={1} />
      <DividedList rows={6} />
    </Shell>
  );
}

export function ConsoleListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Shell className="space-y-6">
      <DividedList rows={rows} />
    </Shell>
  );
}

export function ConsoleHealthSkeleton() {
  return (
    <Shell className="space-y-6">
      <DividedList rows={6} lines={1} />
      <Card height="h-20" />
      <Card height="h-20" />
    </Shell>
  );
}

export function ConsoleInstallsSkeleton() {
  return (
    <Shell className="space-y-6">
      <Heading width="w-56" size="h-6" />
      <Stats n={4} />
      <Stats n={3} cols="sm:grid-cols-3" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>
      <Table rows={5} cols={5} />
    </Shell>
  );
}

export function ConsolePaymentsSkeleton() {
  return (
    <Shell className="space-y-6">
      <Heading width="w-32" size="h-6" />
      <DividedList rows={3} lines={1} />
      <div className="space-y-3 rounded-xl border p-4">
        <Skeleton className="h-5 w-32" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      <Table rows={4} cols={5} />
    </Shell>
  );
}

/* ---------------- Platform and auth ---------------- */

export function WorkspacesSkeleton() {
  return (
    <Shell className="mx-auto max-w-2xl space-y-6 px-4 py-14 md:py-20">
      <HeadingWithAction width="w-44" />
      <DividedList rows={2} />
    </Shell>
  );
}

/** Narrow centered form pages: sign-in, password reset, setup, invitations. */
export function AuthFormSkeleton({
  fields = 2,
  tabs = false,
  buttons = 0,
  width = "max-w-sm",
}: {
  fields?: number;
  tabs?: boolean;
  buttons?: number;
  width?: string;
}) {
  return (
    <Shell className={`w-full ${width} space-y-8`}>
      <Heading width="w-40" />
      <div className="space-y-4">
        {buttons > 0 && (
          <div className="space-y-2">
            <div className="grid auto-cols-fr grid-flow-col gap-3">
              {Array.from({ length: buttons }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
            <div className="flex items-center gap-3 py-2">
              <Skeleton className="h-px flex-1" />
              <Skeleton className="h-3 w-4" />
              <Skeleton className="h-px flex-1" />
            </div>
          </div>
        )}
        {tabs && <Skeleton className="h-9 w-full rounded-lg" />}
        <Form fields={fields} />
      </div>
    </Shell>
  );
}

/* ---------------- Public pages ---------------- */

export function WorkspaceHomeSkeleton() {
  return (
    <PublicFrame>
      <Shell>
        <Skeleton className="h-9 w-64 max-w-full" />
        <Line width="w-96" className="mt-3" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border p-4">
              <Avatar />
              <div className="flex-1 space-y-2">
                <Line width="w-40" />
                <Line width="w-64" className="h-3" />
              </div>
            </div>
          ))}
        </div>
      </Shell>
    </PublicFrame>
  );
}

export function ProfilePublicSkeleton() {
  return (
    <PublicFrame>
      <Shell>
        <div className="flex items-center gap-4">
          <Avatar size="size-16" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Line width="w-72" />
          </div>
        </div>
        <CardList rows={3} height="h-20" gap="mt-10 space-y-3" />
      </Shell>
    </PublicFrame>
  );
}

export function EventPublicSkeleton() {
  return (
    <PublicFrame width="" className="py-12">
      <Shell className="grid gap-8 rounded-2xl border md:grid-cols-[260px_1fr]">
        <aside className="space-y-4 border-b p-6 md:border-r md:border-b-0">
          <div className="flex items-center gap-3">
            <Avatar size="size-10" />
            <Line width="w-28" />
          </div>
          <Skeleton className="h-7 w-44" />
          <Line width="w-32" />
          <Prose lines={4} />
          <Skeleton className="h-9 w-full rounded-lg" />
        </aside>
        <section className="space-y-6 p-6">
          <MonthGrid />
          <SlotGrid n={8} />
        </section>
      </Shell>
    </PublicFrame>
  );
}

export function ManageBookingSkeleton() {
  return (
    <PublicFrame width="max-w-lg">
      <Shell>
        <Heading width="w-40" />
        <div className="mt-8">
          <Details rows={5} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button width="w-40" />
          <Button width="w-28" />
          <Button width="w-40" />
        </div>
      </Shell>
    </PublicFrame>
  );
}

export function RoutingPublicSkeleton() {
  return (
    <PublicFrame width="max-w-lg">
      <Shell>
        <Heading width="w-40" />
        <div className="mt-8">
          <Form fields={4} />
        </div>
      </Shell>
    </PublicFrame>
  );
}

export function WaitlistPublicSkeleton() {
  return (
    <PublicFrame width="max-w-lg">
      <Shell className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Line width="w-80" />
        <Line width="w-64" />
        <Button width="w-32" />
      </Shell>
    </PublicFrame>
  );
}

export function UnsubscribeSkeleton() {
  return (
    <PublicFrame width="max-w-md">
      <Shell className="space-y-4 rounded-2xl border p-6">
        <Skeleton className="h-6 w-40" />
        <Line />
        <Line width="w-5/6" />
        <Button width="w-32" />
      </Shell>
    </PublicFrame>
  );
}

export function DocsIndexSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-9 w-56" />
      <Line width="w-96" className="mt-3" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2 rounded-xl border p-4">
            <Line width="w-32" />
            <Line width="w-full" className="h-3" />
            <Line width="w-3/4" className="h-3" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function DocsPageSkeleton() {
  return (
    <Shell className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-9 w-72" />
        <div className="mt-6">
          <Prose lines={6} />
        </div>
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <div className="mt-6">
          <Prose lines={8} />
        </div>
      </div>
      <aside className="hidden space-y-2 border-l pl-3 xl:block">
        {[0, 1, 2, 3, 4].map((i) => (
          <Line key={i} width={i % 2 ? "w-24" : "w-32"} className="h-3" />
        ))}
      </aside>
    </Shell>
  );
}
