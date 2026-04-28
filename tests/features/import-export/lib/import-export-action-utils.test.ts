import { afterEach, assert, test, vi } from "vitest";
import {
  buildMapExportGroups,
  buildTilesetExportGroups,
  getMapExportData,
  getUniqueArchivePath,
  isDefoldMapExportOptions,
  isGameMakerMapExportOptions,
  isGodotMapExportOptions,
  isRasterExportOptions,
  isTiledMapExportOptions,
  isTiledTilesetExportOptions,
  pickSingleFile,
} from "@/features/import-export/lib/import-export-action-utils";
import { createProjectFixture } from "./action-utils-test-support";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  vi.useRealTimers();

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
});

function installPickerEnvironment() {
  const inputListeners = new Map<string, Set<() => void>>();
  const windowListeners = new Map<string, Set<() => void>>();
  const input = {
    files: undefined as File[] | undefined,
    type: "",
    accept: "",
    name: "",
    id: "",
    addEventListener(event: string, listener: () => void) {
      inputListeners.set(
        event,
        (inputListeners.get(event) ?? new Set()).add(listener),
      );
    },
    removeEventListener(event: string, listener: () => void) {
      inputListeners.get(event)?.delete(listener);
    },
    click: vi.fn(),
  };
  const mockWindow = {
    addEventListener(event: string, listener: () => void) {
      windowListeners.set(
        event,
        (windowListeners.get(event) ?? new Set()).add(listener),
      );
    },
    removeEventListener(event: string, listener: () => void) {
      windowListeners.get(event)?.delete(listener);
    },
    setTimeout,
    clearTimeout,
  };
  Object.assign(globalThis, {
    document: {
      createElement: vi.fn(() => input),
    },
    window: mockWindow,
  });

  return {
    input,
    dispatchInput(event: string) {
      for (const listener of inputListeners.get(event) ?? []) {
        listener();
      }
    },
    dispatchWindow(event: string) {
      for (const listener of windowListeners.get(event) ?? []) {
        listener();
      }
    },
  };
}

test("action-utils type guards and archive path helpers recognize supported option shapes", () => {
  assert.strictEqual(isRasterExportOptions({ fileType: "png" }), true);
  assert.strictEqual(
    isTiledMapExportOptions({
      format: "json",
      tilesetMode: "external",
      encoding: "csv",
      compression: "none",
      compressionLevel: 0,
      renderOrder: "right-down",
    }),
    true,
  );
  assert.strictEqual(isTiledTilesetExportOptions({ format: "lua" }), true);
  assert.strictEqual(
    isGodotMapExportOptions({
      sceneRootName: "Root",
      tilesetMode: "single",
      textureMode: "atlas",
    }),
    true,
  );
  assert.strictEqual(isGameMakerMapExportOptions({ format: "yy" }), true);
  assert.strictEqual(isDefoldMapExportOptions({ format: "collection" }), true);
  assert.strictEqual(
    getUniqueArchivePath("maps/test.tmj", new Set()),
    "maps/test.tmj",
  );

  const usedPaths = new Set(["maps/test.tmj"]);
  assert.strictEqual(
    getUniqueArchivePath("maps/test.tmj", usedPaths),
    "maps/test (2).tmj",
  );
});

test("pickSingleFile resolves a chosen file and falls back to null on window focus cancel", async () => {
  const selected = installPickerEnvironment();
  const file = new File(["ok"], "map.tmx");
  const pickPromise = pickSingleFile(".tmx");
  selected.input.files = [file];
  selected.dispatchInput("change");
  assert.strictEqual(await pickPromise, file);
  assert.strictEqual(selected.input.accept, ".tmx");
  assert.strictEqual(selected.input.name, "import-file");
  assert.match(selected.input.id, /^import-file-/);

  vi.useFakeTimers();
  const canceled = installPickerEnvironment();
  const cancelPromise = pickSingleFile(".json", "custom-input");
  canceled.dispatchWindow("focus");
  vi.advanceTimersByTime(251);
  assert.strictEqual(await cancelPromise, null);
  assert.strictEqual(canceled.input.name, "custom-input");
});

test("getMapExportData and grouped asset builders preserve nested layer data and group ordering", () => {
  const project = createProjectFixture();
  const mapExportData = getMapExportData(project, project.maps[0]!);

  assert.deepEqual(
    mapExportData.layers.map((layer) => layer.id),
    ["layer-a"],
  );
  assert.deepEqual(
    mapExportData.imageLayers.map((layer) => layer.id),
    ["image-a"],
  );
  assert.deepEqual(
    mapExportData.layerGroups.map((group) => group.id),
    ["layer-group-a"],
  );
  assert.deepEqual(
    mapExportData.objectLayers.map((layer) => layer.id),
    ["object-layer-a"],
  );
  assert.deepEqual(
    mapExportData.objects.map((object) => object.id),
    ["object-a"],
  );

  const mapGroups = buildMapExportGroups(project);
  assert.deepEqual(
    mapGroups.map((group) => group.name),
    ["Bravo", "Alpha"],
  );
  assert.deepEqual(mapGroups[1]?.assets[0]?.thumbnail.tilesets, [
    { id: "tileset-a", assetId: "asset-a" },
  ]);

  const tilesetGroups = buildTilesetExportGroups(project);
  assert.deepEqual(
    tilesetGroups.map((group) => group.name),
    ["B Group", "A Group"],
  );
  assert.strictEqual(tilesetGroups[0]?.assets[0]?.subtitle, "16 × 16 px");
});
