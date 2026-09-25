/** Compare to the browser-facing Host, not Next's internal bind address.
 * Deliberately ignore forwarded-host: callers must not choose their own allowlist.
 */
export function sameOrigin(request: Request): boolean {
  const raw = request.headers.get("origin");
  if (!raw) return true; // Non-browser clients still require the private token.
  try {
    const origin = new URL(raw);
    const url = new URL(request.url);
    if (raw !== origin.origin || !["http:", "https:"].includes(origin.protocol))
      return false;
    if (origin.origin === url.origin) return true;
    return (
      origin.host === request.headers.get("host") &&
      origin.protocol === url.protocol
    );
  } catch {
    return false;
  }
}
