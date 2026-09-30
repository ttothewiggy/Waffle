# Waffle changelog

## Unreleased

### Accounts and sync — 2026-09-30 (pending live Supabase setup)

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
