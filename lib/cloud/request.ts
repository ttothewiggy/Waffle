/** Bound the request and response body so a stalled download cannot hold sync forever. */
export class CloudTimeout extends Error {
  readonly code = "WAFFLE_TIMEOUT";
  constructor() {
    super("The cloud request timed out. Check your connection and try again.");
    this.name = "TimeoutError";
  }
}
export function cloudFetch(
  fetcher: typeof fetch = fetch,
  limits = { ordinary: 30_000, photo: 120_000 },
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const source =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    const url = input instanceof Request ? input.url : String(input);
    const timeout = new URL(url).pathname.startsWith("/storage/v1/")
      ? limits.photo
      : limits.ordinary;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => {};
    const deadline = new Promise<never>((_, reject) => {
      cancel = () => {
        const reason =
          source?.reason || new DOMException("Request cancelled", "AbortError");
        controller.abort(reason);
        reject(reason);
      };
      if (source?.aborted) {
        cancel();
        return;
      }
      source?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        const reason = new CloudTimeout();
        controller.abort(reason);
        reject(reason);
      }, timeout);
    });
    try {
      const request = async () => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await fetcher(input, {
          ...init,
          signal: controller.signal,
        });
        // Supabase consumes JSON/Blobs here; buffering includes body reads in the deadline.
        const bytes = await response.arrayBuffer();
        return new Response(
          [204, 205, 304].includes(response.status) ? null : bytes,
          {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          },
        );
      };
      return await Promise.race([request(), deadline]);
    } finally {
      clearTimeout(timer);
      source?.removeEventListener("abort", cancel);
    }
  };
}
