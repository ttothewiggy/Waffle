import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fromText, type RichDocument } from "../lib/document/rich";

test("mounting, disabling and replacing editor content never emits an empty save", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost", pretendToBeVisual: true },
  );
  const browser = dom.window;
  const globals = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    Node: browser.Node,
    HTMLElement: browser.HTMLElement,
    Element: browser.Element,
    DOMParser: browser.DOMParser,
    MutationObserver: browser.MutationObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { createElement, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: RichEditor } = await import("../components/RichEditor");
  const root = createRoot(browser.document.getElementById("root")!);
  const writes: RichDocument[] = [];
  const render = async (doc: RichDocument, disabled = false) => {
    await act(async () => {
      root.render(
        createElement(RichEditor, {
          doc,
          disabled,
          size: 10,
          label: "Test entry",
          onChange: (next) => writes.push(next),
        }),
      );
    });
  };
  try {
    await render(fromText(""));
    await render(fromText("Do not lose this entry."));
    assert.equal(
      browser.document.querySelector('[role="textbox"]')?.textContent,
      "Do not lose this entry.",
    );
    await render(fromText("Do not lose this entry."), true);
    assert.equal(
      browser.document
        .querySelector('[role="textbox"]')
        ?.getAttribute("contenteditable"),
      "false",
    );
    await render(fromText("Do not lose this entry."));
    assert.equal(
      browser.document
        .querySelector('[role="textbox"]')
        ?.getAttribute("contenteditable"),
      "true",
    );
    assert.deepEqual(writes, []);
  } finally {
    await act(async () => root.unmount());
    browser.close();
  }
});
