import type { Entry } from "../storage/types";
import type { PdfOptions } from "./options";
export type PdfEntry = Omit<Entry, "photos" | "revisions" | "blocks"> & {
  photos: {
    id: string;
    name: string;
    caption?: string;
    data: string;
    width: number;
    height: number;
  }[];
};
export interface PdfJob {
  entries: PdfEntry[];
  options: PdfOptions;
  fontsBase: string;
  emojis: Record<string, string>;
}
