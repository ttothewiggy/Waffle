# Waffle changelog

## Unreleased

### Signup notifications — 2026-10-07

- Added a private signup notification endpoint using Resend, with a fixed owner inbox, minimal plain-text account details and authenticated requests.
- Added a separate Supabase background queue with bounded retries and provider deduplication; notification failures do not block registration. No existing accounts are backfilled.
- Added deployment, Vault, SQL activation and delivery troubleshooting instructions.
- Validation: 93 automated tests, TypeScript, changed-file lint and production/offline build passed. Live Supabase scheduling and inbox delivery still require the deployment check.


### AI for registered accounts — 2026-10-04

- Enabled dictation and AI polishing for every confirmed, non-anonymous account, including future signups. Removed the owner-maintained account approval list.
- Kept server-side session verification and rejected signed-out, expired, anonymous and unconfirmed identities.
- Signup notification delivery remains a separate setup task; this change does not send email.


### Account AI access and recording recovery — 2026-10-03

- Replaced manually entered dictation/polishing codes with verified Supabase sessions and an owner-managed server-side list of approved user IDs. No public signup automatically grants paid AI access.
- Added account access checks to both provider endpoints and removed the old-code fallback. Existing models remain unchanged.
- Raised the recording timer to ten minutes with compressed mono speech and a separate safe upload-size guard.
- Added screen wake-lock requests, clear interruption messages, partial-audio preservation, local draft recovery and audio downloads.
- Kept audio on the device until the transcript is saved or the draft discarded; recording drafts stay separate from cloud sync and journal exports.
- Added rollout instructions and tests for account approval, expired/missing identity, provider isolation, screen hiding, microphone errors, wake-lock denial, time/size stops and account-scoped recovery.
- Validation in an isolated copy: 89 automated tests, lint, TypeScript, production build and offline shell generation passed. Samsung/Pixel hardware and live API checks remain necessary after configuration and deployment.


### Offline editing and simpler sync review — 2026-10-01

- Retained the last successful sync on each device so new days, one-sided corrections and independent edits can combine automatically after time offline.
- Added three-way comparison for paragraphs, words/formatting, photos/captions, page settings and deletion-versus-edit, with bounded work for large passages.
- Replaced whole-journal cloud/device choices and compulsory downloads with links to affected days and labelled, coloured review cards inside entries.
- Added Keep this, Keep other and Keep both for competing passages; choices survive reopening and are invalidated if the reviewed content changes.
- Preserved divergent originals in Recently deleted; retained compare-and-swap protection against typing and concurrent cloud writes.
- Added automatic retry for cloud save races. No database migration or cloud-format change required.
- Existing devices need one successful sync to establish the baseline; already-divergent old copies may need an initial day-level review. Uploads wait until outstanding choices are finished.
- Tested a 100-day offline correction batch, additions in both reconnect orders, rich text, photos, deleted entries, stale choices, reopening and upload races. Validation: 78 automated tests passed; lint, TypeScript and production build passed. An isolated browser check verified mobile/desktop review cards and completing choices to resume sync. Live Supabase/device validation remains a post-deployment check.


### PDF books and app update recovery — 2026-10-01

- Added private, on-device PDF book export with A5 portrait as the default and an A4 option.
- Added date ranges, cover title/subtitle, page numbers, print text size, fonts, page colours and optional unwritten days.
- Included formatted text, photos and captions; added an actual PDF preview with facing pages on wide screens and single pages on phones.
- Kept PDF generation cancellable and separate from JSON backup and restore.
- Added locally bundled licensed fonts and emoji rendering without an external export service.
- Diagnosed the cross-device sync interruption as a version mismatch: the old deployed app accepts cloud format 1 while the formatting build writes format 2. The new build reads both and must be deployed to resume syncing on old devices.
- Added clearer newer-version sync instructions and a waiting-update notice that saves locally before reloading.
- Added automated PDF bounds/content tests and cloud-format compatibility tests. Validation: 57 tests, lint, TypeScript and production build passed; browser export, download and mobile/desktop preview checks passed.


### Formatted journal pages — 2026-09-30

- Added a compact icon toolbar for photos, dictation, bold, italic, underline, H1 and H2.
- Kept body sizes from 8–22px; H1 follows at +4px and H2 at +2px.
- Added a typeset date heading, with hide and underline options, without inserting it into the entry’s text.
- Added per-entry serif, sans and handwritten fonts, plus parchment, ivory, pale blue, sage and warm grey page colours.
- Preserved formatting in the editable book view, local saves, cloud sync, backups and restored AI versions.
- Kept existing formatting when dictation adds words; AI drafts start as plain text with the formatted original retained.
- Replaced the persistent synced sentence inside entries with a small indicator beside the bookmark; pending and error messages remain visible.
- Added backup version 3 and cloud manifest version 2, with support for reading older data. No database migration is needed; refresh other devices after deployment before editing.
- Added rich-text validation, pagination and editor-lifecycle regression tests. Validation: 53 tests, lint, TypeScript and production build passed; mobile browser checks covered formatted page edits, reopening, themes, date visibility and 8px text. PDF export remains planned.


### Sync recovery — 2026-09-30

- Added request timeouts, including stalled response downloads: 30 seconds for ordinary requests and two minutes for photo transfers.
- Added clearer recovery messages for expired sign-ins, access errors, missing setup/files, rate limits, oversized uploads and service outages.
- Kept provider error details out of user-facing sync messages.
- Added tests for cancellation, interrupted transfers, retrying and an uncertain save that completed on the server.


### Accounts and sync — 2026-09-30

- Added optional email/password accounts, email confirmation and password reset.
- Added separate offline journal stores per account and explicit import from the original device-only journal.
- Added Supabase cloud sync for entries, photos, captions, saved versions and Recently deleted.
- Added durable pending-sync tracking, sync status and manual retry.
- Added conflict detection and explicit version choice, with downloads and recovery of displaced local entries.
- Added private, content-addressed photo storage and owner-only SQL policies with checked revisions on saves.
- Standard sync is not end-to-end encrypted. Account deletion, permanent photo cleanup, optional encryption and wider-beta hardening remain planned.
- Added setup instructions and automated persistence, concurrency, photo transport and SQL permission tests.


### Final visual refinement — 2026-09-29

- Restored a dark walnut interface around a warmer parchment entry page.
- Added a responsive page frame and small burgundy corner bookmark.
- Kept bottom navigation visible inside entries, with space below content for the toolbar and phone safe area.
- Made Dictate visible beside Add photos even for existing entries; both microphone entry points share the same dialog.
- Extended saved text-size options down to 8px in Settings and entry options; the default remains 16px.
- Requested content resizing around the on-screen keyboard in supporting browsers.
- Validation: lint, 29 automated tests and production build passed. Mobile browser checks confirmed 8px persistence, both dictation entry points, photo attachment/reopening and Export access.

### UI refinement — 2026-09-28

- Made the journal overview the home screen, with dated previews, photo thumbnails, a Today action and an optional calendar.
- Added a dedicated entry screen with a compact date header, back button and entry menu; removed branding, slogans, mode toggles and bottom navigation from the writing surface.
- Reduced default prose to 16px and moved text-size controls to entry options and Settings.
- Replaced overlapping navigation with Journal, Today, Export and Settings. Kept paginated reading and whole-diary browsing as secondary options.
- Made backup and restore permanently accessible in Export and Settings, clearly separated from planned PDF export.
- Made save confirmation temporary, while keeping failed-save messages visible with Retry.
- Preserved existing storage and backup formats, photos/captions, previous versions, dictation and AI polishing.
- Added browser-history navigation for dated entries and a lint command.



## [0.3.0] - 2026-09-25

Deployment: **updated styles**
Commit: `72ab55e`

### Added

- Optional AI polishing with three styles: **Light tidy**, **Improve flow**, and **Rewrite**.
- A draft review step so AI suggestions can be edited, accepted or discarded.
- Saved pre-AI versions, with the ability to inspect and restore previous text.
- Editable, paginated Book view, with one page on narrow screens and two when space permits.
- Whole-diary navigation from the first saved entry through today, retaining dated blank days between entries.
- Photo captions, saved with entries and included in backups.
- A permanent **Export & backup** section.
- Entry deletion with confirmation, immediate undo and a **Recently deleted** recovery area.
- Adjustable writing text size, remembered on the device.
- Backup format version 2, preserving document layout metadata and AI version history while continuing to accept older backups.
- Removed date selector on main page
- Removed picture moving function.

### Changed

- Simplified writing to one continuous text editor.
- Placed photos at the end of entries instead of between paragraphs.
- Removed paragraph and photo movement arrows.
- Made Book view text editable directly on the page. Changes save while typing; pagination updates when leaving the text field.
- Expanded the writing area and tightened text spacing.
- Removed the redundant **Go to date** field; retained calendar navigation.
- Made the selected Write/Book mode clearer with a light fill, gold border and checkmark.
- Added **Whole diary** to desktop and mobile navigation.
- Replaced the earlier waffle symbol with the supplied artwork across the logo, favicon and install icons.
- Added roadmap notes for future PDF/printing options to keep or omit blank days.

### Fixed

- Fixed localhost dictation being rejected because the browser address differed from the server’s internal address.
- Protected recovery of deleted entries from overwriting newer writing on the same date.

### Verification

- All 27 automated tests passed.
- Production build passed.
- Browser checks confirmed page editing, caption persistence after reopening, and navigation through blank diary days.

## [0.2.0] - 2026-09-23

Deployment: **Added dictation feature**
Commit: `3956092`

### Added

- Voice recording and OpenAI-powered transcription.
- Recording playback before sending for transcription.
- Transcript review and editing before appending words to the selected day.
- Recording limits of three minutes and 3 MB per recording.
- A private access-code check for transcription, with the OpenAI API key kept on the server.
- Error handling that retains recordings in the open dialog for retry.
- Downloadable JSON backups containing journal text and photos.
- Backup import with validation and a preview before restoring.
- Restore options to keep existing entries or explicitly replace matching dates.
- Atomic restore operations so failed imports do not leave a partially restored journal.
- Automated tests for backups, restore behaviour and transcription request handling.

### Changed

- Updated deployment from a static export to a Next.js server deployment to support transcription.
- Updated offline caching for the new build structure, excluding API requests.
- Extended the warm styling to backup and dictation dialogs.
- Added setup instructions for local and Vercel environment variables.

### Privacy

- Audio is sent for transcription only when requested.
- Recordings are not saved into the journal.
- Ordinary writing and backup operations remain browser-local.

## Redeployment of [0.1.1] - 2026-09-23

Deployment: **Updated styling and slogans**
Vercel reference: redeploy of `BzZAX6Kks`

- Redeployed the existing styling-and-slogans release.
- No separate code changes are identified by this redeployment entry.
- Retained version **0.1.1** rather than assigning a new release number.

## [0.1.1] - 2026-09-23

Deployment: **Updated styling and slogans**
Commit: `96746cc`

### Changed

- Reworked the visual theme towards a warm, fireside study: walnut tones, parchment surfaces and warmer accents.
- Updated Waffle-themed slogans and interface copy, including:
  - “A little space for your waffles.”
  - “Your waffles.”
  - “No perfect words needed. Just waffle.”
  - “One waffle at a time.”
- Updated browser and install-icon colours to match the warmer theme.
- Standardised the local development address on port 3001.
- Updated project documentation to use the renamed Waffle folder.
- Added instructions for restarting and rebuilding after moving or renaming the project folder.

## [0.1.0] - 2026-09-23

Deployment: **Rename journal product to Waffle, preserving existing local entries**
Commit: `22424f7`

### Initial release

- Built the mobile-first journal using Next.js, React and TypeScript.
- Opened directly to today’s journal entry.
- Supported creating and editing text entries for individual calendar days.
- Supported attaching and removing photos.
- Saved journal text and photos locally in the browser using IndexedDB.
- Added save-status feedback and retry handling for storage failures.
- Added calendar navigation and a history of previous entries.
- Supported editing earlier days.
- Added responsive desktop and phone layouts.
- Added PWA install metadata, app icons and an offline app shell.
- Established separate boundaries for storage and future AI, encryption, PDF and native-device integrations.
- Added initial persistence and date-handling tests.

### Branding

- Renamed the product from **Daybook** to **Waffle**.
- Updated app metadata, interface branding, package naming and install information.
- Preserved the existing local database so the rename did not discard saved entries.

### Initial limitations

- Journal data was stored on the current device only, without cloud sync or encryption.
- Dictation, backup/restore, AI polishing and PDF export were not yet available.
