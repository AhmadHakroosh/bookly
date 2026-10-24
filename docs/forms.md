# Forms

Booking questions and routing-form questions are **forms**: versioned, with a builder in the admin and one renderer on every public page. The builder is behind the `forms_v2` flag (a "Beta" badge shows while it is in beta); without it, event types and routing forms keep the simple question list described in [Scheduling](scheduling.md) and [Routing forms](routing.md).

## The builder

Open it from an event type (**Booking questions → Edit questions**) or a routing form (**Questions → Edit questions**). The first time, it creates the form from the questions already there, keeping their ids, so stored answers and routing rules stay valid.

- **Question types:** short answer, paragraph, email, phone, link, number, date, dropdown, checkboxes (several), yes or no, checkbox, consent, file upload, plus headings and text blocks that ask nothing.
- **Show only when:** any question can depend on answers above it: _is_ / _is not_ / _contains_, _is answered_, _is yes_, _includes_ for checkboxes, _more than_ / _less than_ for numbers, _has a file_. Combine several with _all_ or _any_. A question that is hidden is not required, and whatever was typed into it before it was hidden is not kept. Conditions can only look back, so showing and hiding can never loop.
- **Pages:** split a long form into pages with optional titles. Booking and routing pages show them one after another; step-by-step pages with save-and-resume come with applications.
- **Consent:** the text people agree to, an optional link, and what kind of consent it is. Each answer keeps the version of the text it agreed to (it changes exactly when the words do).
- **File upload:** documents (PDF, Word, text), images, PDF only, or any document, image or media file; up to 10 files and 10 MB each.
- **Preview:** the form as people will see it, conditions included, next to the builder.

Changes are a **draft** until you **Publish**. Publishing makes a new, immutable version; everyone who opens the page from then on gets it, and every answer keeps pointing at the version it was given to, so old answers still read correctly after you rename or remove questions. **Discard changes** goes back to what is live. Who can edit: an event type's questions, its host or an owner or admin; a routing form's, anyone on the team (as with the routing editor).

Saving the event type or routing form no longer touches its questions once the builder owns them. Emails, briefings, the booking page and the API keep reading the answers as before (`bookings.answers`, one line per question; a file question reads "1 file").

## Files people send

A file question uploads straight from the browser while the person fills in the form: to your S3 bucket with a presigned URL, or through the app on the local storage driver. The first upload starts a private **draft** for that visitor, identified by a token only their browser holds; the form is sent with it, and the files belong to that answer from then on.

- Public uploads are capped at **10 MB** per file, take only the types the question allows (and only types Bookly accepts at all), and are limited per visitor (20 per ten minutes) and per form (300 per hour). They count toward the workspace's storage.
- Bookly checks the file's first bytes against its type; a file that is not what it says (an HTML page named `cv.pdf`) is deleted and refused.
- Files are private and never appear in the drive. The host sees them on the booking page under "Their answers"; they open only for members of the workspace. With a malware scanner configured (ClamAV on self-hosted installs, see [Self-hosting](self-hosting.md#scanning-files-people-send)), a file it flags is refused at upload and a clean file can be opened in the browser; unscanned files only ever download.
- Files of a form that was never sent are deleted after 7 days, and the unsent draft after 30.

The endpoints are `POST /api/forms/<formId>/uploads` (announce a file: question id, name, type, size; returns where to send it and the draft token), `PUT /api/forms/<formId>/uploads/<fileId>` (local driver only), `POST …/<fileId>/complete` and `DELETE …/<fileId>`, each with the token in `x-form-token`.
