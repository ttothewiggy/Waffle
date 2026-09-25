import { DocumentBlock } from "../storage/types";
/** The caller measures using the same typography and dimensions as visible pages. */
export function paginate(
  blocks: DocumentBlock[],
  fits: (page: DocumentBlock[]) => boolean,
): DocumentBlock[][] {
  const pages: DocumentBlock[][] = [];
  let page: DocumentBlock[] = [];
  const turn = () => {
    if (page.length) {
      pages.push(page);
      page = [];
    }
  };
  for (const block of blocks) {
    if (block.type === "photo") {
      if (!fits([...page, block])) turn();
      page.push(block);
      continue;
    }
    let chars = Array.from(block.text);
    if (!chars.length) continue;
    while (chars.length) {
      const whole = { ...block, text: chars.join("") };
      if (fits([...page, whole])) {
        page.push(whole);
        break;
      }
      let lo = 0,
        hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits([...page, { ...block, text: chars.slice(0, mid).join("") }]))
          lo = mid;
        else hi = mid - 1;
      }
      if (lo === 0 && page.length) {
        turn();
        continue;
      }
      let take = Math.max(1, lo);
      // Prefer a word boundary; always make progress for a long unbroken word.
      const prefix = chars.slice(0, take).join("");
      const boundary = prefix.search(/\s+\S*$/);
      if (boundary > prefix.length / 2)
        take = Array.from(prefix.slice(0, boundary + 1)).length;
      page.push({ ...block, text: chars.slice(0, take).join("") });
      chars = chars.slice(take);
      turn();
    }
  }
  turn();
  return pages.length ? pages : [[]];
}
