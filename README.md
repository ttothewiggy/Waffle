# Daybook

A mobile-first, device-local journal built with Next.js, React and TypeScript.

## Your editable project

This copy lives at `/Users/alexevans/Projects/Daybook`. Open this folder in your editor. Work here going forward; the original copy in the ChatGPT project directory is separate and will not automatically receive edits. Git history is preserved.

## Run

Node 20.9+; `npm ci`, then `npm run dev`. Open the Local URL printed in the terminal (normally http://localhost:3000). The development server uses polling to avoid macOS file-watcher limits. For a production preview, run `npm run build` then `npm start`. `npm run build` produces a static `out/` directory suitable for HTTPS hosting and a future Capacitor `webDir`. `npm test` checks persistence; `npm run typecheck` checks types.

## Phone / PWA

Open the deployed HTTPS URL in Android Chrome and use Install app / Add to Home screen. Once the initial page and offline cache have loaded, the app shell can open offline. A development LAN HTTP URL does not support service workers or full PWA installation. Authentication on private hosting may require connectivity before reaching the app on a fresh device.

## Data

Text and photo Blobs are stored together in IndexedDB on this browser origin. Save feedback follows transaction completion. Wait for “Saved on this device” before closing. Entries are not encrypted, backed up or synced. Browser storage can be cleared or evicted. Private browsing may not retain entries. Do not use v0.1 as your only copy of valuable memories. Multiple simultaneous editing tabs are not supported (last write wins).

See docs/v0.1.md for scope, model, visual direction and module boundaries. No production authentication, billing, encryption, AI or export system is implemented. Integration contracts reserve those boundaries without fake implementations.
