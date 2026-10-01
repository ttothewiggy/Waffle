import { Font } from "@react-pdf/renderer";
export const pdfFamilies = {
  serif: "WaffleSerif",
  sans: "WaffleSans",
  handwritten: "WaffleHand",
};
const definitions = [
  ["WaffleSerif", "libre-baskerville", "latin"],
  ["WaffleSerifExt", "libre-baskerville", "latin-ext"],
  ["WaffleSans", "noto-sans", "latin"],
  ["WaffleLatinExt", "noto-sans", "latin-ext"],
  ["WaffleGreek", "noto-sans", "greek"],
  ["WaffleCyrillic", "noto-sans", "cyrillic"],
  ["WaffleHand", "kalam", "latin"],
  ["WaffleHandExt", "kalam", "latin-ext"],
];
export const fallbackFonts = [
  "WaffleSans",
  "WaffleLatinExt",
  "WaffleGreek",
  "WaffleCyrillic",
];
export function registerPdfFonts(base: string, emojis: Record<string, string>) {
  for (const [family, file, subset] of definitions)
    Font.register({
      family,
      fonts: [400, 700].flatMap((weight) =>
        ["normal", "italic"].map((style) => ({
          src: `${base}/${file === "kalam" && style === "italic" ? "waffle-hand" : file}-${subset}-${weight}-${style}.woff`,
          fontWeight: weight,
          fontStyle: style as "normal" | "italic",
        })),
      ),
    });
  Font.registerEmojiSource({
    withVariationSelectors: true,
    builder: (codes) => {
      const emoji = String.fromCodePoint(
        ...codes.split("-").map((code) => parseInt(code, 16)),
      );
      if (!emojis[emoji])
        throw new Error(
          "An emoji could not be prepared. Please retry the export.",
        );
      return emojis[emoji];
    },
  });
}
export function fontStack(font: keyof typeof pdfFamilies) {
  return [
    pdfFamilies[font],
    font === "serif"
      ? "WaffleSerifExt"
      : font === "handwritten"
        ? "WaffleHandExt"
        : "WaffleLatinExt",
    ...fallbackFonts,
  ];
}
