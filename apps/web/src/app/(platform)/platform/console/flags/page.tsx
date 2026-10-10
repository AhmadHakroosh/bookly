import { ConsoleListSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Dropdown } from "@/components/dropdown";
import { listCohorts, listFlags } from "@/server/flags";
import {
  addCohort,
  addCohortWorkspaces,
  removeCohort,
  removeCohortWorkspace,
  updateFlag,
} from "./actions";

export const metadata = { title: "Feature flags", robots: { index: false } };

const STATES = [
  { value: "off", label: "Off — nobody" },
  { value: "beta", label: "Beta — cohorts and grants" },
  { value: "on", label: "On — everyone" },
];

async function FlagsPage() {
  await connection();
  const [flags, cohorts] = await Promise.all([listFlags(), listCohorts()]);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Flags</h2>
          <p className="text-sm text-muted-foreground">
            A flag is off, in beta (open to the cohorts ticked here and to workspaces granted it on
            their page, unless the workspace opted out of betas), or on for everyone. Per workspace
            denials always win.
          </p>
        </div>
        <ul className="divide-y rounded-xl border text-sm">
          {flags.map((f) => (
            <li key={f.key} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs">{f.key}</code>
                <Badge
                  variant={
                    f.state === "on" ? "default" : f.state === "beta" ? "secondary" : "outline"
                  }
                >
                  {f.state}
                </Badge>
                <span className="text-muted-foreground">{f.description}</span>
              </div>
              <form
                action={updateFlag.bind(null, f.key)}
                className="flex flex-wrap items-center gap-3"
              >
                <Dropdown
                  name="state"
                  defaultValue={f.state}
                  ariaLabel="State"
                  className="w-56"
                  options={STATES}
                />
                {cohorts.length > 0 && (
                  <fieldset className="flex flex-wrap items-center gap-3">
                    <legend className="sr-only">Cohorts</legend>
                    {cohorts.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          name="cohorts"
                          value={c.id}
                          defaultChecked={f.cohortIds.includes(c.id)}
                        />
                        {c.name}
                      </label>
                    ))}
                  </fieldset>
                )}
                <SubmitButton variant="outline" size="sm">
                  Save
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Beta cohorts</h2>
          <p className="text-sm text-muted-foreground">
            Named groups of workspaces a flag can be opened to as a whole: design partners, an
            industry, a region. A workspace can be in several.
          </p>
        </div>
        <form action={addCohort} className="flex flex-wrap items-center gap-2">
          <Input
            name="name"
            placeholder="Cohort name"
            required
            className="w-48"
            aria-label="Cohort name"
          />
          <Input
            name="description"
            placeholder="What it is for"
            className="w-72"
            aria-label="Description"
          />
          <SubmitButton variant="outline">Add cohort</SubmitButton>
        </form>
        <ul className="divide-y rounded-xl border text-sm">
          {cohorts.map((c) => (
            <li key={c.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{c.name}</span>
                  {c.description && (
                    <span className="text-muted-foreground"> · {c.description}</span>
                  )}
                </div>
                <form action={removeCohort.bind(null, c.id)}>
                  <SubmitButton variant="ghost" size="sm">
                    Delete cohort
                  </SubmitButton>
                </form>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {c.workspaces.map((w) => (
                  <li
                    key={w.workspaceId}
                    className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                  >
                    <Link
                      href={`/console/${w.workspaceId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {w.slug}
                    </Link>
                    <form action={removeCohortWorkspace.bind(null, c.id, w.workspaceId)}>
                      <SubmitButton variant="ghost" size="icon-xs" aria-label={`Remove ${w.slug}`}>
                        ×
                      </SubmitButton>
                    </form>
                  </li>
                ))}
                {c.workspaces.length === 0 && (
                  <li className="text-xs text-muted-foreground">No workspaces yet.</li>
                )}
              </ul>
              <form
                action={addCohortWorkspaces.bind(null, c.id)}
                className="flex flex-wrap items-center gap-2"
              >
                <Input
                  name="slugs"
                  placeholder="Workspace slugs, comma-separated"
                  className="w-80"
                  aria-label="Workspace slugs"
                />
                <SubmitButton variant="outline" size="sm">
                  Add workspaces
                </SubmitButton>
              </form>
            </li>
          ))}
          {cohorts.length === 0 && (
            <li className="p-8 text-center text-muted-foreground">No cohorts yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

export default function FlagsPageBoundary() {
  return (
    <Suspense fallback={<ConsoleListSkeleton />}>
      <FlagsPage />
    </Suspense>
  );
}
