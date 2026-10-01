# PDF book export

Open Export > Make a PDF book. A5 portrait (148 × 210 mm) is the default; A4 portrait (210 × 297 mm) is also available. The PDF contains individual pages. The preview shows a cover/first page on its own, followed by facing pages on wider screens, and one page at a time on phones. The PDF also requests a two-page-right layout in viewers that support it.

Choose a date range, title/subtitle, cover, font style and printable text size. Printable text size is independent of the device's reading size. Each day starts a new page and long days continue over additional pages. Include unwritten days to preserve dated gaps. Blank days are generated for export only and never saved as journal entries. White pages are the default for economical printing; the page-colour option uses each entry's saved theme.

Photos follow that day's text, keep their aspect ratio and stay with their captions. JPEG/PNG/WebP/GIF images are decoded on the device and reduced to a maximum 2200-pixel edge for export. Animated images become a still image. Originals are unchanged.

## Privacy and implementation

- Entries are read from the current account/device repository after pending local writes finish. Nothing is uploaded for PDF creation.
- Image preparation and emoji rasterisation use browser canvas. PDF typesetting runs in a cancellable web worker with locally bundled fonts.
- The preview renders the actual generated PDF through a bundled PDF.js worker. It does not display or import arbitrary third-party PDFs.
- Headings, bold, italic, underline, date preferences, captions and journal font styles carry through. The serif PDF font is Libre Baskerville rather than the browser's system Georgia font.
- Font assets include SIL Open Font License notices. The handwritten oblique face is derived from Kalam and renamed WaffleHandOblique. The optional authoring script is `scripts/pdf-oblique-fonts.py`; Python/fonttools are not required to run the app.
- Current export bounds: 366 days/entries, 500,000 text characters, 200 photos and 150 MB of original photo bytes. Larger journals can be exported in date-range volumes.
- Latin/extended Latin, Greek and Cyrillic are supported by bundled fonts; emoji use the device's glyphs. Unsupported writing systems produce a clear error instead of silently omitting characters.
- The PDF is a readable edition, not a restorable backup. Continue using JSON backup for recovery.

This first exporter is for personal reading and home printing. It does not yet produce a printer-specific cover wrap, spine, bleed, colour profile or imposed booklet sheets. For an external printer, start with its template and requirements. Two A5 pages can be viewed together as an approximately A4 landscape spread, but that does not determine duplex/booklet print order.

## Validation

Automated tests generate actual A5/A4 PDFs and inspect their text, dimensions, image operators, page numbers and text bounds. Date tests cover leap days, selection limits and non-mutating blank days. Browser checks cover generation, preview navigation and downloads using a separate synthetic journal. A representative sample is generated and visually inspected with Poppler; QA PDFs and temporary assets are ignored by Git.
