# Waffle — roadmap after daily use

## Current short hardening pass

- Permanent Export & backup section on desktop and mobile, containing backup/restore and honest planned PDF/printed-book cards.
- Existing entries remain editable. Native date picker with deliberate Go, previous/next day and Back to today. Selecting a day keeps the history calendar aligned. Crossing midnight updates the Today label without moving the open editor.
- Delete moves the entire day, including photos, to durable local Recently deleted; immediate Undo and later restore are available. Recovery refuses to overwrite another active entry. Deleted entries are not in backup files. No automatic expiry or permanent purge in this pass.
- Photo ordering is explicit earlier/later controls that work with touch and keyboard. Photos still follow the text.
- Waffle-grid logo, favicon and home-screen icons. Smaller default writing type, tighter line spacing, narrower desktop notebook, and remembered 16–22px-equivalent size controls. Browser zoom is not restricted.

## Next: optional cleanup with originals preserved

Transcription already works end to end. First streamline repeated recording/appending, then provide explicit Light tidy, Improve flow and Rewrite actions on the assembled entry. Never require cleanup. Preserve source transcripts and accepted revisions separately before allowing AI replacement; current entries contain editable appended text, not immutable transcript history. Preview a candidate, compare it with the original, accept or discard. Do not invent events, people, feelings or facts. Explain exactly which text goes to the AI provider. Keep this independent of photo data.

## Design now, implement as a separate sync milestone

Proposed product modes: local-only journal without an account; optional encrypted cloud sync with email-linked accounts. Both retain the same editor and support export. These modes are proposals, not implemented guarantees.

Target: an offline working copy with encrypted remote copies for device-loss resilience. Choose audited encryption tooling rather than designing cryptographic primitives. Entries and photo content should be encrypted on the device before upload if the operator must be unable to read them. Database permissions and transport/storage encryption alone do not meet that product promise.

Resolve before choosing a database/provider:
- What attacker and device-compromise scenarios are in scope?
- How are a second device and its encryption keys approved?
- How does a user who loses every device recover? Email/password reset alone must not be represented as recovery of end-to-end encrypted content. Consider a recovery key and trusted-device flow; any provider-recoverable key custody changes the privacy claim.
- Which metadata remains visible (account email, sizes, sync times), and what are retention rules?
- How do conflicting offline edits merge without losing content? How do deletions propagate, and when do server backups expire?
- How do users export, migrate between modes and permanently delete their account/data?
- AI processing is separate consent: transcription currently sends audio through Waffle's server to OpenAI. Future cleanup similarly exposes selected plaintext to the processing service. We cannot promise that operator/cloud AI can never access plaintext while routing those requests this way.

Do not move existing journals to a server automatically. Account access, key recovery and MFA need separate designs. Keep the data-sale prohibition and user control as product commitments, backed by a defined implementation and policy.

## Book layout and PDF editions

Start with one excellent Classic edition: date range, title/cover, dates, page numbers and photos. Expand to month/year/custom ranges, covers/subtitles/photos, page sizes, photo layouts, titles, optional locations, fonts and accents. Then Minimal, Scrapbook, Modern and eventually user themes.

Before inline photos or two-page editing, evolve content from one text string plus an image list into ordered text/photo blocks, retaining stable photo IDs and migrating existing entries safely. Share the page-layout rules between an on-screen book preview and PDF output. On phones show one page; on wide screens show a spread. Keep a fluid writing mode so mobile keyboards and accessibility text enlargement do not fight fixed print pages. Exact pagination needs font embedding, image sizing, overflow rules, long-entry splitting and export verification. Page-turn animation is a finishing touch, not the layout system.

## Physical books

Investigate print-on-demand partners only after PDF quality and demand are proven. Printer-specific bleed, trim, colour and binding requirements belong to that integration. Any referral revenue should be disclosed; sending a journal to a printer must be an explicit user choice. There is no printing provider or referral arrangement yet.

## PWA and Android

Installation metadata and offline caching already exist; test real-device cold starts, updates, keyboard resizing, microphone interruption/sleep and photo selection as ongoing acceptance checks. Do not treat those as future-only features. Add release/version update guidance and regression checks. Later: Capacitor packaging with an explicit hosted transcription endpoint, then device photo discovery, biometric unlock, beta and store release. Current server-enabled Next.js output is not directly a Capacitor bundle.

## Current verification

15 automated tests pass: legacy schema upgrade, photos/text persistence, versioned backup round trip, invalid backup rejection, merge/replace, transaction rollback, durable deletion/recovery and overwrite refusal, ordered photos, transcription request boundaries. A separate browser origin is used for disposable UI restore/deletion checks. No live journal or paid transcription is used for these tests.

Browser verification completed on a separate production-preview origin: imported a disposable JSON backup with one entry and two real PNGs; opened it from history; reordered photos; changed writing size; deleted the day; reloaded; recovered it from Recently deleted; jumped directly to its date. Both images loaded, order and text survived, the size preference remained, and the 366px-wide layout had no horizontal overflow. The normal development origin was not used for test data.

## September 25: document editing and optional AI

Implemented in this pass:
- Local dictation accepts the browser-facing Host when Next binds to 0.0.0.0. Unrelated origins remain rejected; forwarded-host is not an allowlist. The private token is still required.
- Optional Light tidy / Improve flow / Rewrite via a server-only Responses API route, using OPENAI_API_KEY with verified, confirmed, non-anonymous account sessions. Review and edit a draft before applying. All prior pre-AI text/layout versions stay in the journal, and are included in backups.
- Editable text/photo blocks. Photo at cursor splits a paragraph around inserted photos; arrows move text or pictures through the document. Existing entries acquire blocks only when edited; their original text/photos remain readable.
- A wider writing surface, plus Book reading mode: measured pagination at the current font size, one page on narrow screens and two when the available reading area reaches 760px. Long text is split without losing characters. This is a responsive reading preview, not a final print/PDF layout. Writing still uses a scrolling editor; live editing across page breaks and photo text-wrap remain future work.
- Overlapping bordered waffle vector mark, favicon and install icons.

AI sends only the chosen day's text; no photos, other entries or history. No automatic calls while typing. The server requests `store: false`; this disables response storage for retrieval, not all provider retention. Nothing is sent until Create a draft is pressed. Input is limited to 20,000 characters, with bounded request bodies and timeouts. AI is fallible: users review names, facts and meaning. Photos retain approximate paragraph positions after a rewrite and may need moving.

The shared access token is an early private-beta gate, not per-user authentication or a public-launch rate-limiting solution. Cloud sync/encryption remains unimplemented. Never expose either server variable through NEXT_PUBLIC_.

Backups now export format version 2 (inline layout and revision history); imports accept both versions 1 and 2. New backups should be restored in the updated app. Deleting a photo removes its bytes; text version history does not resurrect deleted photos.

Official references: [Text generation](https://developers.openai.com/api/docs/guides/text), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Responses storage controls](https://developers.openai.com/api/docs/guides/migrate-to-responses).

## Editor simplification (supersedes the inline-photo UI above)

- Write now uses one continuous textarea. All pictures follow the text with editable captions (500 characters maximum). Removed all paragraph/photo movement arrows and insertion controls. Drag/drop and text wrapping around images are deferred.
- Book text is editable in place. While a page has focus its boundaries are held stable, and edits save through the same repository queue. Leaving the field re-paginates the complete text. Additional text can scroll within the active page until reflow. Photos appear on separate pages after the text, with editable captions.
- Existing inline photo order is preserved when loading; new edits retire placement metadata. Text and AI version history are preserved. Caption text is included in backup export/import; older photos without captions still work.
- AI prompts are unchanged: mode-specific instructions at the top of lib/ai/server.ts, shared editing instructions in the Responses request in the same file.

## Whole diary and supplied artwork

Whole diary is available in desktop and mobile navigation. It covers the earliest nonempty saved entry through today, retaining every intervening calendar day. Next/Previous turns within the current day, then continues to the neighbouring day; backwards navigation opens that day's final spread. Empty days have dated blank pages and are not saved unless edited. Days are paginated on demand, avoiding rendering a full multi-year diary at once.

Future PDF/print settings must offer **Keep blank days** (authentic diary) and **Omit blank days** (compact book). This is a roadmap requirement; PDF printing is not yet implemented. In-app Whole diary always keeps gaps.

Removed the redundant Go to date field. The active Write/Book option is now light-filled with a brass border and checkmark. The user-supplied artwork is retained at public/waffle-artwork.png and resized for app, Apple and browser icons without redesigning it.
