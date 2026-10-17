# Files

A drive for the workspace, behind the `files` feature flag (Console → Flags; a **Beta** badge
shows while it is in beta). **Admin → Files** has five places:

- **My files**: yours alone. Folders nest as deep as you like.
- **Team**: folders and files every member sees (Team plan).
- **Contacts**: one folder per contact, holding what they sent you (_Received from them_) and
  the files you keep for them (_Ours_).
- **Recent**: everything you can see, newest first.
- **Trash**: deleted files and folders, restorable for 30 days, then deleted for good. A folder
  comes back with everything that was deleted with it.

Upload (several at once), new folder, rename, move (between My files, Team and their folders),
"Belongs to…" (put a file in a contact's folder; it also shows on their timeline), move to the
trash, restore, delete forever, search by name. Clicking a file opens it in a side pane: a
preview for images and PDFs, where it came from, its contact and the tasks it is on. Lists load
50 at a time (**Show more**).

**View** (in a file's "…" menu and its pane) opens an image or PDF in a large viewer with **Open
in new tab** and **Download**. Any other type is download only: View is disabled and says so,
and the file is never rendered in the browser. A file's name on a task, on the contact page's
Files card and on the timeline opens the same viewer (or downloads); Cmd/Ctrl-click opens it in
a new tab.

Who sees what: your My files are yours; Team files and anything that belongs to a contact are
seen by every member; a file on a task is seen by whoever can see the task.

## Guests' attachments

With guest replies on (`docs/contacts.md`), the attachments of a guest's reply are kept in their
folder, linked to the email they came with: the timeline shows them as links, and the file's
pane links back to the email. Inline images (signatures, logos) are skipped. A file larger than
25 MB, a full storage quota or a plan without Files keeps the name on the timeline with the
reason instead.

## Files on tasks

A task's pane has a **Files** section: upload (the file goes into the drive, into the task's
contact folder when the task belongs to a contact, and onto the task) or **Add from Files** to
link files already in the drive. Whenever a file is linked to a contact, or to a task that
belongs to a contact, it also appears on the contact's timeline ("File added to “task”: name"),
with links to the file and the task. Deleting a task leaves its files in the drive.

## Sending files

The quick-send emails on a contact (proposal, payment request, follow-up), timeline replies and
the reply box in the entry pane have **Attach from Files** and **Upload**. Files up to 10 MB in
total go as real attachments; the rest go as links that work for 7 days without signing in. Sent
files show on the email's timeline entry.

## Plans and storage

| Plan        | Files                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| Free        | Avatar and logo uploads only                                            |
| Pro         | My files, contact folders, guests' attachments, files on tasks, sending |
| Team        | Everything in Pro, plus Team folders                                    |
| Self-hosted | Everything                                                              |

Gates are `attachments` and `sharedFolders` in `packages/cloud`, checked on the server. Every
file counts towards the storage quota (Free 1 GB, Pro 20 GB, Team 20 GB per seat pooled), which
is checked before an upload starts. Bytes go through the storage driver (R2 / S3 / local disk,
`docs/self-hosting.md`); uploads go straight to the bucket with a presigned URL.

## Activity log

`file.uploaded`, `file.received`, `file.renamed`, `file.moved`, `file.contact_set`,
`file.linked`, `file.unlinked`, `file.sent`, `file.trashed`, `file.restored`, `file.deleted`,
`folder.created`, `folder.renamed`, `folder.trashed`, `folder.restored`. The workspace export
includes folders, file records and links (the bytes stay in storage).
