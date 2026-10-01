import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";
import { newEntry } from "../lib/storage/types";
import { fromText, plainText, defaultAppearance } from "../lib/document/rich";
import {
  selectPdfEntries,
  dayCount,
  pageSizes,
  type PdfOptions,
} from "../lib/pdf/options";
import type { PdfJob } from "../lib/pdf/types";
const options: PdfOptions = {
  from: "2026-09-27",
  to: "2026-09-30",
  size: "A5",
  title: "My journal",
  subtitle: "An ordinary week",
  cover: true,
  blankDays: false,
  photos: true,
  colours: false,
  font: "entry",
  textSize: 11,
};
test("PDF date selection includes exact boundaries, leap days and optional empty days without changing entries", () => {
  const entry = { ...newEntry("2026-09-28"), text: "Kept" };
  assert.deepEqual(selectPdfEntries([entry], options), [entry]);
  const days = selectPdfEntries([entry], { ...options, blankDays: true });
  assert.deepEqual(
    days.map((e) => e.date),
    ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"],
  );
  assert.equal(days[0].text, "");
  assert.equal(entry.text, "Kept");
  assert.equal(dayCount("2028-02-28", "2028-03-01"), 3);
  assert.throws(
    () => selectPdfEntries([entry], { ...options, from: "2026-02-30" }),
    /valid start/,
  );
  assert.throws(
    () =>
      selectPdfEntries([entry], {
        ...options,
        from: "2020-01-01",
        blankDays: true,
      }),
    /one year/,
  );
  assert.throws(
    () => selectPdfEntries([], { ...options, blankDays: false }),
    /no written/,
  );
});
test("real PDF output keeps dimensions, formatted text, photos, blank dates and page numbers inside the page", async () => {
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const dir = resolve("node_modules/.cache/waffle-tests");
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `pdf-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: 'export {renderBook} from "./lib/pdf/render";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  try {
    const { renderBook } = (await import(pathToFileURL(file).href)) as {
      renderBook: (job: PdfJob) => Promise<Blob>;
    };
    const rich = fromText(
      "A beautiful day\nWhānau and café, with bold and italic words.\n\n" +
        "A quiet moment worth remembering. ".repeat(140),
    );
    rich.content[0] = {
      type: "heading",
      attrs: { level: 1 },
      content: [
        {
          type: "text",
          text: "A beautiful day",
          marks: [{ type: "underline" }],
        },
      ],
    };
    rich.content[1].content = [
      {
        type: "text",
        text: "Whānau and café, with bold and italic words.",
        marks: [{ type: "bold" }, { type: "italic" }],
      },
    ];
    const source = {
      ...newEntry("2026-09-28"),
      text: plainText(rich),
      richText: rich,
      appearance: { ...defaultAppearance, font: "handwritten" as const },
    };
    const image = `data:image/png;base64,${(await readFile("public/waffle-icon-180.png")).toString("base64")}`;
    for (const [size, stress] of [
      ["A5", false],
      ["A4", false],
      ["A5", true],
    ] as const) {
      const settings = {
        ...options,
        size,
        blankDays: true,
        colours: size === "A4",
        cover: size === "A5",
        ...(stress
          ? {
              title: "W".repeat(100),
              subtitle: "A very long subtitle to test the title page layout. "
                .repeat(4)
                .slice(0, 180),
            }
          : {}),
      };
      const entries = selectPdfEntries([source], settings).map((e) => ({
        ...e,
        photos:
          e.date === source.date
            ? [
                {
                  id: "test",
                  name: "Test photo",
                  caption: "The photo caption survived.",
                  data: image,
                  width: 180,
                  height: 180,
                },
              ]
            : [],
      }));
      const blob = await renderBook({
        entries,
        options: settings,
        fontsBase: resolve("public/pdf-fonts"),
        emojis: {},
      });
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false,
        useSystemFonts: false,
        standardFontDataUrl:
          resolve("node_modules/pdfjs-dist/standard_fonts") + "/",
      }).promise;
      let all = "",
        body = "",
        images = 0;
      assert.ok(pdf.numPages >= 4);
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n),
          vp = page.getViewport({ scale: 1 });
        assert.ok(Math.abs(vp.width - pageSizes[size].width) < 0.01);
        assert.ok(Math.abs(vp.height - pageSizes[size].height) < 0.01);
        const content = await page.getTextContent();
        for (const item of content.items)
          if ("str" in item) {
            all += item.str + " ";
            if (item.transform[5] > 45 && item.transform[5] < vp.height - 45)
              body += item.str;
            if (item.str.trim()) {
              assert.ok(
                item.transform[5] > 5 && item.transform[5] < vp.height - 5,
                `Text outside page: ${item.str}`,
              );
              assert.ok(
                item.transform[4] >= 10 &&
                  item.transform[4] + item.width < vp.width - 10,
                `Text too wide: ${item.str}`,
              );
            }
          }
        if (!settings.cover || n > 1)
          assert.ok(
            content.items.some(
              (item) =>
                "str" in item &&
                item.str === String(n - (settings.cover ? 1 : 0)) &&
                item.transform[5] < 45,
            ),
            `Missing footer on page ${n}`,
          );
        const ops = await page.getOperatorList();
        images += ops.fnArray.filter(
          (op) => op === pdfjs.OPS.paintImageXObject,
        ).length;
      }
      assert.match(all.replace(/\s+/g, ""), /Whānau/);
      assert.match(all, /café/);
      assert.match(all, /The photo caption survived/);
      assert.match(all, /Monday/);
      assert.match(all, /Sunday/);
      assert.equal(
        (
          body.replace(/[\s-]/g, "").match(/Aquietmomentworthremembering\./g) ||
          []
        ).length,
        140,
      );
      assert.ok(images > 0);
      await pdf.destroy();
    }
    await assert.rejects(
      renderBook({
        entries: [{ ...source, text: "中文", richText: undefined, photos: [] }],
        options,
        fontsBase: resolve("public/pdf-fonts"),
        emojis: {},
      }),
      /cannot render/,
    );
  } finally {
    await rm(file, { force: true });
  }
});
