import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { useTilesetImageImport } from "@/features/map-editor/hooks/use-tileset-image-import";
import type { PendingTilesetImageImport } from "@/features/map-editor/types/tileset-import";

const hookMocks = vi.hoisted(() => ({
  createPendingTilesetImageImport: vi.fn(),
}));

vi.mock("@/features/map-editor/lib/tileset-image-import", () => ({
  createPendingTilesetImageImport: hookMocks.createPendingTilesetImageImport,
}));

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalActEnvironment = (
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const { window } = parseHTML("<html><body></body></html>");

function installReactDomEnvironment() {
  Object.assign(globalThis, {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

async function renderTilesetImageImportHook() {
  installReactDomEnvironment();

  let current: ReturnType<typeof useTilesetImageImport> | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    current = useTilesetImageImport();
    return null;
  }

  await act(async () => {
    root.render(createElement(Harness));
  });

  return {
    getCurrent() {
      if (!current) {
        throw new Error("Hook did not render.");
      }

      return current;
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();

  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  if (typeof originalActEnvironment === "boolean") {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

test("queueImageFile enters choice mode by default", async () => {
  const rendered = await renderTilesetImageImportHook();
  const file = new File(["image"], "terrain.png", { type: "image/png" });
  const pendingImport = {
    fileName: "terrain.png",
    name: "terrain",
    mimeType: "image/png",
    buffer: new ArrayBuffer(8),
    image: {} as HTMLImageElement,
    width: 64,
    height: 64,
  } satisfies PendingTilesetImageImport;

  hookMocks.createPendingTilesetImageImport.mockResolvedValueOnce(
    pendingImport,
  );

  await act(async () => {
    await expect(rendered.getCurrent().queueImageFile(file)).resolves.toBe(
      pendingImport,
    );
  });

  expect(rendered.getCurrent().pendingImport).toBe(pendingImport);
  expect(rendered.getCurrent().mode).toBe("choice");

  await rendered.unmount();
});

test("queueImageFile stays idle when the choice dialog is suppressed", async () => {
  const rendered = await renderTilesetImageImportHook();
  const file = new File(["image"], "terrain.png", { type: "image/png" });
  const pendingImport = {
    fileName: "terrain.png",
    name: "terrain",
    mimeType: "image/png",
    buffer: new ArrayBuffer(8),
    image: {} as HTMLImageElement,
    width: 64,
    height: 64,
  } satisfies PendingTilesetImageImport;

  hookMocks.createPendingTilesetImageImport.mockResolvedValueOnce(
    pendingImport,
  );

  await act(async () => {
    await expect(
      rendered.getCurrent().queueImageFile(file, { showChoiceDialog: false }),
    ).resolves.toBe(pendingImport);
  });

  expect(rendered.getCurrent().pendingImport).toBe(pendingImport);
  expect(rendered.getCurrent().mode).toBe("idle");

  await rendered.unmount();
});
