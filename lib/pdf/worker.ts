import { renderBook } from "./render";
import type { PdfJob } from "./types";
self.onmessage = async (event: MessageEvent<PdfJob>) => {
  try {
    const blob = await renderBook(event.data);
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "The PDF could not be created.",
    });
  }
};
