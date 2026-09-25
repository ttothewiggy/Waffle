import type { Photo } from "./types";
export function movePhoto(
  photos: Photo[],
  id: string,
  direction: -1 | 1,
): Photo[] {
  const index = photos.findIndex((photo) => photo.id === id),
    target = index + direction;
  if (index < 0 || target < 0 || target >= photos.length) return photos;
  const ordered = [...photos];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered;
}
