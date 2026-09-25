# Waffle

A mobile-first, device-local journal built with Next.js, React and TypeScript.

## Your editable project

This copy lives at `/Users/alexevans/Projects/Waffle`. Open this folder in your editor. Work here going forward; the original copy in the ChatGPT project directory is separate and will not automatically receive edits. Git history is preserved.

## Run

Node 20.9+; `npm ci`, then `npm run dev`. Open the Local URL printed in the terminal (http://localhost:3001). The development server uses polling to avoid macOS file-watcher limits. For a production preview, run `npm run build` then `npm start`. `npm run build` produces a Next.js server deployment plus a generated offline worker. Vercel must use the Next.js preset and its default output directory, not `out/`. `npm test` checks persistence; `npm run typecheck` checks types.

## Phone / PWA

Open the deployed HTTPS URL in Android Chrome and use Install app / Add to Home screen. Once the initial page and offline cache have loaded, the app shell can open offline. A development LAN HTTP URL does not support service workers or full PWA installation. Authentication on private hosting may require connectivity before reaching the app on a fresh device.

## Data

Text and photo Blobs are stored together in IndexedDB on this browser origin. Save feedback follows transaction completion. Wait for “Saved on this device” before closing. Entries are not encrypted or synced. Backups are manual: use Backup & restore under Your journal. Browser storage can be cleared or evicted. Private browsing may not retain entries. Keep an exported backup of valuable memories. Multiple simultaneous editing tabs are not supported (last write wins).

See docs/v0.1.md for scope, model, visual direction and module boundaries. See docs/v0.2.md for backup/restore and dedicated transcription setup. There is no account system, billing, encryption, cloud sync or PDF export.

## After moving or renaming the folder

Stop the development server before moving the project. If it was moved while running, stop it and remove the generated `.next` directory, then run `npm run dev` from the new folder. This rebuilds cached absolute paths; journal data in the browser is unaffected. Development uses port 3001. Run only one development server for this project.

## Dictation setup

See [v0.2 setup](docs/v0.2.md). Add server-only `OPENAI_API_KEY` and `WAFFLE_DICTATION_TOKEN` in Vercel and redeploy. The private access code must be at least 24 characters. Never enter the API key in the app. Live transcription uses OpenAI and requires a network connection.

## Everyday journal controls

Export & backup now has its own navigation item. Delete day moves an entry and its photos to Recently deleted, where you can restore it even after reopening; backups include active days only. Use the arrows beneath photos to reorder them. A− / A+ adjusts writing size and remembers the preference on this browser. The full product direction is in [the roadmap](docs/roadmap.md).

### Inline writing, book pages and AI polish

The **Write** view is one continuous text editor, followed by photos with optional captions (up to 500 characters). **Book** has editable text pages and photo pages at the end. Text saves while typing; page boundaries stay steady while focused and reflow when you leave the field. Page count responds to screen width and writing size. PDF export is still planned.

**Polish with AI** offers Light tidy, Improve flow and Rewrite. Use the same private code as dictation. Review the draft before applying; **Before AI editing** below the document lets you inspect/restore saved originals. The existing `OPENAI_API_KEY` and `WAFFLE_DICTATION_TOKEN` power both routes—no new key is required. Restart the local server after changing environment variables; redeploy Vercel after pushing these changes. Only the selected day's text is sent for polishing, and only on request. No live journal content is used by automated tests.

Backups include inline layouts and original versions (format v2); older v1 backups remain importable.
