# Formatted journal entries

The writing toolbar supports bold, italic, underline, H1 and H2, alongside photo and dictation buttons. Select words before applying a mark, or toggle a mark and keep typing. A heading styles the current paragraph; toggling it again returns to body text. Enter at the end of a heading starts a body paragraph. Standard undo/redo keyboard shortcuts are supported.

Body size remains a device reading preference (8–22px). H1 is body +4px; H2 is body +2px. Entry options now save a font family, page colour, date visibility and date underline with each entry. Defaults are classic serif and parchment. The handwritten font (Kalam, OFL licensed) is bundled for offline use. Appearance is per entry, not a global theme setting.

The date heading is presentation, never journal text: opening an empty day does not count as writing or send the date decoration to AI. Photos and captions remain after the text. Book pages are still editable, reflow on blur, and use the same formatting and appearance. A continued paragraph keeps its heading style across page boundaries.

## Storage and compatibility

- `Entry.text` remains the plain-text representation used by previews, AI and compatibility code.
- Optional `Entry.richText` uses a restricted JSON document: paragraphs, H1/H2, text, hard breaks and bold/italic/underline marks. No stored HTML, arbitrary attributes, links or embedded media.
- Old entries are converted in memory when opened, preserving their exact whitespace. New edits save both representations.
- Dictation appends ordinary paragraphs while keeping existing formatting.
- Accepting an AI draft saves the formatted original in version history. The new draft is plain text for subsequent formatting. Restoring an older formatted version restores its formatting, while retaining the current version too.
- Backup version 3 carries rich text and appearance; versions 1 and 2 still import. Plain text and rich text must agree or the import is rejected.
- Cloud manifest version 2 carries these fields, including deleted entries and saved versions. Version 1 remains readable. Existing database tables and storage policies need no migration.
- Older Waffle builds reject manifest version 2 rather than silently stripping formatting. After deploying, refresh every browser/device and reopen the installed app before continuing to write. If an old installed app reports that a newer version is needed, close all Waffle windows and reopen it online so its pending service-worker update can activate.

## Validation

Automated tests cover legacy whitespace, validation of imported rich documents, local persistence, backup/restore, cloud transport, AI originals, dictation append and split-paragraph editing. A mounted-editor regression test ensures initialising or disabling an editor cannot trigger an empty save. Browser checks use a separate local port and synthetic entries, not the daily journal.

PDF export remains a separate next step. This shared document model gives the exporter structured headings and marks to render.
