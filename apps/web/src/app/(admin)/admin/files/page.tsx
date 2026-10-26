import Link from "next/link";
import { PaneHeader } from "@/components/ui/pane-header";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PaneHost } from "@/components/pane";
import { FileTypeIcon } from "@/components/ui/file-row";
import { PLANS, planFor } from "@bookly/cloud";
import {
  ClockIcon,
  ContactRoundIcon,
  FolderIcon,
  SearchIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { FileViewButtons } from "@/components/drive/file-viewer";
import { UploadButton } from "@/components/drive/upload-button";
import { BookingsSkeleton } from "@/components/skeletons/pages";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { formatBytes } from "@bookly/cloud";
import { fmtDateTime, formatInTz } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  PREVIEWABLE,
  breadcrumbs,
  contactsWithFiles,
  decodeFileCursor,
  fileDetails,
  listContactFiles,
  listFolder,
  listRecent,
  listTrash,
  searchFiles,
  type DriveRow,
  type Viewer,
} from "@/server/drive";
import { hasFlag, inBeta } from "@/server/flags";
import { hasFeature, storageBudgetFor, storageUsed } from "@/server/limits";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { FileActions } from "./file-actions";
import { FileSheet, UnlinkTaskButton } from "./file-sheet";
import { FolderMenu, NewFolderButton, RestoreFolderButton } from "./folder-actions";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Files" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
type View = "my" | "team" | "contacts" | "recent" | "trash";
/** The drive's views, as `ui mocks.png` 06 names them: everything, yours, clients', shared. */
const VIEWS: [View, string, LucideIcon][] = [
  ["recent", "All files", ClockIcon],
  ["my", "My files", UserRoundIcon],
  ["contacts", "Client files", ContactRoundIcon],
  ["team", "Shared", UsersIcon],
  ["trash", "Trash", Trash2Icon],
];

async function FilesPage({ searchParams }: PageProps<"/admin/files">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams as Promise<SP>,
  ]);
  if (!ws) return null;
  if (!(await hasFlag(ws, "files"))) redirect("/admin");
  const can = hasFeature(ws, "attachments");
  const canTeam = hasFeature(ws, "sharedFolders");
  const v: Viewer = { userId: session.user.id, ws };
  const [beta, used, budget, profile] = await Promise.all([
    inBeta(ws, "files"),
    storageUsed(ws),
    storageBudgetFor(ws),
    getProfileByUser(ws.id, session.user.id),
  ]);
  const tz = profile?.timezone ?? ws.timezone;
  const contactId = one(sp.contact);
  const view: View = contactId
    ? "contacts"
    : ((VIEWS.find(([k]) => k === one(sp.view))?.[0] ?? "recent") as View);
  const folderId = one(sp.folder) ?? null;
  const q = one(sp.q)?.trim() ?? "";
  const filter = (["all", "received", "ours"] as const).find((f) => f === one(sp.filter)) ?? "all";
  const cursor = decodeFileCursor(one(sp.after));
  const current: Record<string, string | null> = {
    view: contactId ? null : view,
    folder: folderId,
    contact: contactId ?? null,
    q: q || null,
    filter: filter === "all" ? null : filter,
  };
  const hrefFor = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...current, after: null, file: null, ...patch }))
      if (val) p.set(k, val);
    const s = p.toString();
    return `/admin/files${s ? `?${s}` : ""}`;
  };

  if (!can)
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
        <p className="text-sm text-muted-foreground">
          A drive for your workspace: your files, a folder for every contact with what they sent
          you, and files on tasks. Files come with {PLANS[planFor("attachments")].name}.{" "}
          <Link
            href="/admin/billing"
            className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
          >
            Upgrade
          </Link>
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Files"
        badge={beta && <BetaBadge />}
        description={
          <>
            {formatBytes(used)} used{budget !== null ? ` of ${formatBytes(budget)}` : ""}
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          label="Drive"
          items={VIEWS.filter(([k]) => k !== "team" || canTeam).map(([k, label]) => ({
            href: `/admin/files?view=${k}`,
            label,
            active: view === k && !q,
          }))}
        />
        <form method="get" action="/admin/files" className="relative w-full sm:w-64" role="search">
          <SearchIcon
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search files…"
            aria-label="Search files"
            size="sm"
            className="pl-9"
          />
        </form>
      </div>
      {!canTeam && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Shared team folders come with {PLANS[planFor("sharedFolders")].name}.
        </p>
      )}
      <section aria-label="Files" className="min-w-0 space-y-4">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          {q ? (
            <SearchView v={v} q={q} cursor={cursor} hrefFor={hrefFor} tz={tz} canTeam={canTeam} />
          ) : view === "my" || view === "team" ? (
            <FolderView
              v={v}
              space={view === "my" ? "personal" : "team"}
              folderId={folderId}
              cursor={cursor}
              hrefFor={hrefFor}
              tz={tz}
              canTeam={canTeam}
            />
          ) : view === "contacts" ? (
            contactId ? (
              <ContactView
                v={v}
                contactId={contactId}
                filter={filter}
                cursor={cursor}
                hrefFor={hrefFor}
                tz={tz}
                canTeam={canTeam}
              />
            ) : (
              <ContactsView v={v} />
            )
          ) : view === "recent" ? (
            <RecentView v={v} cursor={cursor} hrefFor={hrefFor} tz={tz} canTeam={canTeam} />
          ) : (
            <TrashView v={v} tz={tz} canTeam={canTeam} />
          )}
        </Suspense>
      </section>
      <PaneHost param="file" id={one(sp.file) ?? null} label="File">
        {one(sp.file) && (
          <FilePane
            v={v}
            fileId={one(sp.file)!}
            closeHref={hrefFor({})}
            tz={tz}
            canTeam={canTeam}
          />
        )}
      </PaneHost>
    </div>
  );
}

type HrefFor = (patch: Record<string, string | null>) => string;

function FileRows({
  files,
  hrefFor,
  tz,
  canTeam,
  userId,
  trashed = false,
}: {
  files: DriveRow[];
  hrefFor: HrefFor;
  tz: string;
  canTeam: boolean;
  userId: string;
  trashed?: boolean;
}) {
  const cols =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_7.5rem_auto]";
  return (
    <>
      {files.length > 0 && (
        <li aria-hidden className={`${cols} py-2 text-xs text-muted-foreground`}>
          <span>Name</span>
          <span className="hidden sm:block">Owner</span>
          <span className="hidden sm:block">Client</span>
          <span className="hidden sm:block">{trashed ? "Deleted" : "Updated"}</span>
          <span className="w-8" />
        </li>
      )}
      {files.map((f) => {
        const open = hrefFor({ file: f.id });
        return (
          <li key={f.id} className={`${cols} py-2 text-sm`}>
            <span className="flex min-w-0 items-center gap-3">
              <FileTypeIcon name={f.name} />
              <span className="min-w-0">
                {trashed ? (
                  <span className="block truncate font-medium">{f.name}</span>
                ) : (
                  <Link
                    href={open}
                    scroll={false}
                    className="block truncate font-medium hover:underline"
                  >
                    {f.name}
                  </Link>
                )}
                <span className="block truncate text-xs text-muted-foreground sm:hidden">
                  {[f.contactName, f.ownerName, formatBytes(f.size)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </span>
            <span className="hidden truncate text-muted-foreground sm:block">
              {f.ownerName ?? "—"}
            </span>
            <span className="hidden truncate sm:block">
              {f.contactId && f.contactName ? (
                <Link
                  href={`/admin/contacts/${f.contactId}`}
                  className="text-primary hover:underline"
                >
                  {f.contactName}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">
              {formatInTz(f.deletedAt ?? f.updatedAt ?? f.readyAt ?? f.createdAt, tz, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <FileActions
              file={{ id: f.id, name: f.name, mime: f.mime, contactId: f.contactId }}
              detailsHref={open}
              canWrite={f.space !== "personal" || f.uploadedBy === userId}
              canTeam={canTeam}
              trashed={trashed}
            />
          </li>
        );
      })}
    </>
  );
}

function More({ next, hrefFor }: { next: string | null; hrefFor: HrefFor }) {
  return next ? (
    <Link href={hrefFor({ after: next })} className="text-sm underline underline-offset-4">
      Show more
    </Link>
  ) : null;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

async function FolderView({
  v,
  space,
  folderId,
  cursor,
  hrefFor,
  tz,
  canTeam,
}: {
  v: Viewer;
  space: "personal" | "team";
  folderId: string | null;
  cursor: ReturnType<typeof decodeFileCursor>;
  hrefFor: HrefFor;
  tz: string;
  canTeam: boolean;
}) {
  const [{ folders, files, next }, trail] = await Promise.all([
    listFolder(v, space, folderId, cursor),
    breadcrumbs(v, folderId),
  ]);
  const root = space === "personal" ? "My files" : "Team";
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
          <Link
            href={hrefFor({ folder: null })}
            className={trail.length ? "text-muted-foreground hover:text-foreground" : "font-medium"}
          >
            {root}
          </Link>
          {trail.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <Link
                href={hrefFor({ folder: f.id })}
                className={
                  i === trail.length - 1
                    ? "font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {f.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex gap-2">
          <NewFolderButton space={space} parentId={folderId} />
          <UploadButton target={folderId ? { folderId } : { space }} />
        </div>
      </div>
      {folders.length === 0 && files.length === 0 ? (
        <Empty>
          {space === "personal"
            ? "Your files are only yours. Upload one, or make a folder."
            : "Files here are shared with everyone in the workspace."}
        </Empty>
      ) : (
        <ul
          className="divide-y rounded-xl border bg-card"
          aria-label={`${trail.at(-1)?.name ?? root} contents`}
        >
          {folders.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Link
                href={hrefFor({ folder: f.id })}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {f.name}
              </Link>
              <FolderMenu folder={{ id: f.id, name: f.name }} />
            </li>
          ))}
          <FileRows files={files} hrefFor={hrefFor} tz={tz} canTeam={canTeam} userId={v.userId} />
        </ul>
      )}
      <More next={next} hrefFor={hrefFor} />
    </>
  );
}

async function ContactsView({ v }: { v: Viewer }) {
  const list = await contactsWithFiles(v);
  if (!list.length)
    return (
      <Empty>
        Each contact gets a folder with what they send you and the files you keep for them.
      </Empty>
    );
  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Contact folders">
      {list.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Link
            href={`/admin/files?contact=${c.id}`}
            className="min-w-0 flex-1 truncate font-medium hover:underline"
          >
            {c.name}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">
            {c.count} file{c.count === 1 ? "" : "s"}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function ContactView({
  v,
  contactId,
  filter,
  cursor,
  hrefFor,
  tz,
  canTeam,
}: {
  v: Viewer;
  contactId: string;
  filter: "all" | "received" | "ours";
  cursor: ReturnType<typeof decodeFileCursor>;
  hrefFor: HrefFor;
  tz: string;
  canTeam: boolean;
}) {
  const { db } = await import("@/lib/db");
  const { and, eq, schema } = await import("@bookly/db");
  const contact = await db().query.contacts.findFirst({
    where: and(eq(schema.contacts.id, contactId), eq(schema.contacts.workspaceId, v.ws.id)),
    columns: { id: true, name: true, email: true },
  });
  if (!contact) return <Empty>That contact is gone.</Empty>;
  const { files, next } = await listContactFiles(v, contact.id, filter, cursor);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Folder path" className="flex items-center gap-1 text-sm">
          <Link
            href="/admin/files?view=contacts"
            className="text-muted-foreground hover:text-foreground"
          >
            Contacts
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/admin/contacts/${contact.id}`} className="font-medium hover:underline">
            {contact.name || contact.email}
          </Link>
        </nav>
        <UploadButton target={{ contactId: contact.id }} />
      </div>
      <nav aria-label="Show" className="inline-flex rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ["all", "All"],
            ["received", "Received from them"],
            ["ours", "Ours"],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={hrefFor({ filter: k === "all" ? null : k })}
            aria-current={filter === k ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1",
              filter === k
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {files.length === 0 ? (
        <Empty>Files they send you and files you keep for them show up here.</Empty>
      ) : (
        <ul
          className="divide-y rounded-xl border bg-card"
          aria-label={`${contact.name || contact.email}'s files`}
        >
          <FileRows files={files} hrefFor={hrefFor} tz={tz} canTeam={canTeam} userId={v.userId} />
        </ul>
      )}
      <More next={next} hrefFor={hrefFor} />
    </>
  );
}

async function RecentView({
  v,
  cursor,
  hrefFor,
  tz,
  canTeam,
}: {
  v: Viewer;
  cursor: ReturnType<typeof decodeFileCursor>;
  hrefFor: HrefFor;
  tz: string;
  canTeam: boolean;
}) {
  const { files, next } = await listRecent(v, cursor);
  if (!files.length) return <Empty>Nothing yet.</Empty>;
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card" aria-label="Recent files">
        <FileRows files={files} hrefFor={hrefFor} tz={tz} canTeam={canTeam} userId={v.userId} />
      </ul>
      <More next={next} hrefFor={hrefFor} />
    </>
  );
}

async function SearchView({
  v,
  q,
  cursor,
  hrefFor,
  tz,
  canTeam,
}: {
  v: Viewer;
  q: string;
  cursor: ReturnType<typeof decodeFileCursor>;
  hrefFor: HrefFor;
  tz: string;
  canTeam: boolean;
}) {
  const { files, next } = await searchFiles(v, q, cursor);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Results for “{q}” ·{" "}
        <Link
          href="/admin/files"
          className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
        >
          clear
        </Link>
      </p>
      {files.length === 0 ? (
        <Empty>No files match.</Empty>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label="Search results">
          <FileRows files={files} hrefFor={hrefFor} tz={tz} canTeam={canTeam} userId={v.userId} />
        </ul>
      )}
      <More next={next} hrefFor={hrefFor} />
    </>
  );
}

async function TrashView({ v, tz, canTeam }: { v: Viewer; tz: string; canTeam: boolean }) {
  const { files, folders } = await listTrash(v);
  if (!files.length && !folders.length)
    return <Empty>The trash is empty. Things stay here 30 days.</Empty>;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Files and folders in the trash are deleted for good after 30 days.
      </p>
      <ul className="divide-y rounded-xl border bg-card" aria-label="Trash">
        {folders.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <RestoreFolderButton folderId={f.id} />
          </li>
        ))}
        <FileRows
          files={files}
          hrefFor={(p) => `/admin/files?view=trash${p.file ? `&file=${p.file}` : ""}`}
          tz={tz}
          canTeam={canTeam}
          userId={v.userId}
          trashed
        />
      </ul>
    </>
  );
}

async function FilePane({
  v,
  fileId,
  closeHref,
  tz,
  canTeam,
}: {
  v: Viewer;
  fileId: string;
  closeHref: string;
  tz: string;
  canTeam: boolean;
}) {
  const d = await fileDetails(v, fileId);
  if (!d)
    return (
      <FileSheet title="File not found" closeHref={closeHref}>
        <p className="text-sm text-muted-foreground">This file was deleted or is not yours.</p>
      </FileSheet>
    );
  const { file, contact, tasks } = d;
  const src = `/files/${file.id}`;
  return (
    <FileSheet title={file.name} closeHref={closeHref}>
      <div className="space-y-5">
        <PaneHeader
          as="h1"
          title={file.name}
          actions={
            <FileActions
              file={{ id: file.id, name: file.name, mime: file.mime, contactId: file.contactId }}
              canWrite={file.space !== "personal" || file.uploadedBy === v.userId}
              canTeam={canTeam}
            />
          }
        />
        {file.mime.startsWith("image/") && PREVIEWABLE.has(file.mime) ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private file behind /files, not a static asset
          <img
            src={src}
            alt={file.name}
            className="max-h-96 w-full rounded-lg border object-contain"
          />
        ) : file.mime === "application/pdf" ? (
          <iframe src={src} title={file.name} className="h-96 w-full rounded-lg border bg-white" />
        ) : null}
        <FileViewButtons file={{ id: file.id, name: file.name, mime: file.mime }} />
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Size</dt>
          <dd>{formatBytes(file.size)}</dd>
          <dt className="text-muted-foreground">Added</dt>
          <dd>{fmtDateTime(file.readyAt ?? file.createdAt, tz)}</dd>
          <dt className="text-muted-foreground">Where</dt>
          <dd>
            {file.space === "personal"
              ? "My files"
              : file.space === "team"
                ? "Team"
                : "Contact's folder"}
          </dd>
          {contact && (
            <>
              <dt className="text-muted-foreground">Contact</dt>
              <dd>
                <Link
                  href={`/admin/contacts/${contact.id}`}
                  className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
                >
                  {contact.name || contact.email}
                </Link>
              </dd>
            </>
          )}
          {file.source && file.source !== "upload" && (
            <>
              <dt className="text-muted-foreground">Came from</dt>
              <dd>
                {file.source === "email" && contact && file.sourceId ? (
                  <Link
                    href={`/admin/contacts/${contact.id}?entry=${file.sourceId}`}
                    className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
                  >
                    Their email
                  </Link>
                ) : file.source === "task" ? (
                  "Uploaded on a task"
                ) : (
                  file.source
                )}
              </dd>
            </>
          )}
        </dl>
        <section aria-labelledby="file-tasks" className="space-y-2">
          <h2 id="file-tasks" className="text-sm font-semibold">
            Tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not on any task. Link it from a task&apos;s pane.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/tasks?task=${t.id}`}
                    className="truncate underline underline-offset-4"
                  >
                    {t.title}
                  </Link>
                  <UnlinkTaskButton fileId={file.id} taskId={t.id} title={t.title} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </FileSheet>
  );
}

export default function FilesPageBoundary(props: PageProps<"/admin/files">) {
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <FilesPage {...props} />
    </Suspense>
  );
}
