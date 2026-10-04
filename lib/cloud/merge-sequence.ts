/** Bounded three-way diff. Ambiguous or very large overlaps are reviewed, never guessed. */
export interface Change<T> {
  start: number;
  end: number;
  items: T[];
}
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function changes<T>(base: T[], next: T[]): Change<T>[] {
  let start = 0,
    end = base.length,
    tail = next.length;
  while (start < end && start < tail && same(base[start], next[start])) start++;
  while (end > start && tail > start && same(base[end - 1], next[tail - 1])) {
    end--;
    tail--;
  }
  if (start === end && start === tail) return [];
  const n = end - start,
    m = tail - start;
  if (!n || !m || (n + 1) * (m + 1) > 1_000_000)
    return [{ start, end, items: next.slice(start, tail) }];
  const a = base.slice(start, end).map((x) => JSON.stringify(x));
  const b = next.slice(start, tail).map((x) => JSON.stringify(x));
  const width = m + 1,
    matrix = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      matrix[i * width + j] =
        a[i] === b[j]
          ? 1 + matrix[(i + 1) * width + j + 1]
          : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
  const result: Change<T>[] = [];
  let i = 0,
    j = 0,
    active: Change<T> | undefined;
  const finish = () => {
    if (active) result.push(active);
    active = undefined;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      finish();
      i++;
      j++;
      continue;
    }
    active ||= { start: start + i, end: start + i, items: [] };
    if (
      j < m &&
      (i === n || matrix[i * width + j + 1] > matrix[(i + 1) * width + j])
    )
      active.items.push(next[start + j++]);
    else {
      i++;
      active.end = start + i;
    }
  }
  finish();
  return result;
}
function overlaps<T>(a: Change<T>, b: Change<T>) {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return a.start > b.start && a.start < b.end;
  if (b.start === b.end) return b.start > a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}
export function mergeSequence<T>(
  base: T[],
  local: T[],
  remote: T[],
  overlap: (base: T[], local: T[], remote: T[], start: number) => T[],
  combineInsertions = false,
): T[] {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;
  const edits = [
    ...changes(base, local).map((x) => ({ ...x, side: 0 })),
    ...changes(base, remote).map((x) => ({ ...x, side: 1 })),
  ].sort((a, b) => a.start - b.start || a.end - b.end || a.side - b.side);
  const result: T[] = [];
  let cursor = 0;
  while (edits.length) {
    const group = [edits.shift()!];
    // Include transitively overlapping edits from either side.
    for (let i = 0; i < edits.length; ) {
      if (group.some((x) => overlaps(x, edits[i]))) {
        group.push(edits.splice(i, 1)[0]);
        i = 0;
      } else i++;
    }
    const start = Math.min(...group.map((x) => x.start)),
      end = Math.max(...group.map((x) => x.end));
    result.push(...base.slice(cursor, start));
    const apply = (side: number) => {
      const out: T[] = [];
      let at = start;
      for (const change of group
        .filter((x) => x.side === side)
        .sort((a, b) => a.start - b.start)) {
        out.push(...base.slice(at, change.start), ...change.items);
        at = change.end;
      }
      return [...out, ...base.slice(at, end)];
    };
    const l = apply(0),
      r = apply(1),
      original = base.slice(start, end);
    result.push(
      ...(same(l, r)
        ? l
        : same(original, l)
          ? r
          : same(original, r)
            ? l
            : combineInsertions && start === end
              ? [...r, ...l]
              : overlap(original, l, r, start)),
    );
    cursor = end;
  }
  return [...result, ...base.slice(cursor)];
}
