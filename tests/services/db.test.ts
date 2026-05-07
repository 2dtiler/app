import { afterEach, assert, beforeEach, test, vi } from "vitest";
import type {
  LospecPaletteRecord,
  Palette,
} from "@/features/image-editor/types";
import {
  cleanOrphanedAssets,
  db,
  deleteAsset,
  deleteAssets,
  deletePaletteLibrary,
  deleteProject,
  deleteProjectPrefs,
  deleteQuickExportPreference,
  deleteQuickExportSaveTarget,
  getAsset,
  getAssetUrl,
  getProject,
  getSettings,
  listProjects,
  loadLospecPaletteCache,
  loadLospecPaletteCacheIds,
  loadLastProjectId,
  loadPaletteLibrary,
  loadProjectPrefs,
  loadQuickExportPreference,
  loadQuickExportSaveTarget,
  saveAsset,
  saveLastProjectId,
  saveLospecPaletteCache,
  savePaletteLibrary,
  saveProject,
  saveProjectPrefs,
  saveQuickExportPreference,
  saveQuickExportSaveTarget,
  saveSettings,
} from "@/services/db";
import type {
  ImageLayer,
  MapObject,
  ObjectLayer,
  Project,
  TileMapData,
  Tileset,
} from "@/types";

const originalLocalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
const originalCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalLocalStorage) {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  URL.createObjectURL = originalCreateObjectURL;
});

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };

  Object.assign(globalThis, { localStorage: localStorageMock });
  return { store, localStorageMock };
}

function installDbTableStubs() {
  const projectStore = new Map<
    string,
    { id: string; name: string; data: string; updatedAt: number }
  >();
  const assetStore = new Map<
    string,
    { id: string; data: ArrayBuffer; mimeType: string; createdAt: number }
  >();
  const settingsStore = new Map<
    string,
    { id: string; autoSaveEnabled: boolean }
  >();
  const lospecPaletteStore = new Map<string, LospecPaletteRecord>();
  const preferenceStore = new Map<
    string,
    {
      id: string;
      projectId: string;
      assetType: string;
      assetId: string;
      optionId?: string;
      updatedAt: number;
    }
  >();
  const saveTargetStore = new Map<
    string,
    {
      id: string;
      projectId: string;
      assetType: string;
      assetId: string;
      optionId: string;
      updatedAt: number;
    }
  >();

  const originals = {
    assets: {
      put: db.assets.put,
      get: db.assets.get,
      delete: db.assets.delete,
      bulkDelete: db.assets.bulkDelete,
      toCollection: db.assets.toCollection,
    },
    projects: {
      put: db.projects.put,
      get: db.projects.get,
      delete: db.projects.delete,
      toArray: db.projects.toArray,
      orderBy: db.projects.orderBy,
    },
    settings: {
      get: db.settings.get,
      put: db.settings.put,
    },
    lospecPalettes: {
      bulkPut: db.lospecPalettes.bulkPut,
      orderBy: db.lospecPalettes.orderBy,
      toCollection: db.lospecPalettes.toCollection,
    },
    quickExportPreferences: {
      put: db.quickExportPreferences.put,
      get: db.quickExportPreferences.get,
      delete: db.quickExportPreferences.delete,
      where: db.quickExportPreferences.where,
    },
    quickExportSaveTargets: {
      put: db.quickExportSaveTargets.put,
      get: db.quickExportSaveTargets.get,
      delete: db.quickExportSaveTargets.delete,
      where: db.quickExportSaveTargets.where,
    },
  };

  db.assets.put = vi.fn(async (record) => {
    assetStore.set(record.id, record);
  }) as typeof db.assets.put;
  db.assets.get = vi.fn(async (id) =>
    assetStore.get(id as string),
  ) as typeof db.assets.get;
  db.assets.delete = vi.fn(async (id) => {
    assetStore.delete(id as string);
  }) as typeof db.assets.delete;
  db.assets.bulkDelete = vi.fn(async (ids) => {
    for (const id of ids as string[]) {
      assetStore.delete(id);
    }
  }) as typeof db.assets.bulkDelete;
  db.assets.toCollection = vi.fn(
    () =>
      ({
        primaryKeys: async () => [...assetStore.keys()],
      }) as ReturnType<typeof db.assets.toCollection>,
  ) as typeof db.assets.toCollection;

  db.projects.put = vi.fn(async (record) => {
    projectStore.set(record.id, record);
  }) as typeof db.projects.put;
  db.projects.get = vi.fn(async (id) =>
    projectStore.get(id as string),
  ) as typeof db.projects.get;
  db.projects.delete = vi.fn(async (id) => {
    projectStore.delete(id as string);
  }) as typeof db.projects.delete;
  db.projects.toArray = vi.fn(async () => [
    ...projectStore.values(),
  ]) as typeof db.projects.toArray;
  db.projects.orderBy = vi.fn(
    () =>
      ({
        reverse: () => ({
          toArray: async () =>
            [...projectStore.values()].sort(
              (left, right) => right.updatedAt - left.updatedAt,
            ),
        }),
      }) as ReturnType<typeof db.projects.orderBy>,
  ) as typeof db.projects.orderBy;

  db.settings.get = vi.fn(async (id) =>
    settingsStore.get(id as string),
  ) as typeof db.settings.get;
  db.settings.put = vi.fn(async (record) => {
    settingsStore.set(record.id, record);
  }) as typeof db.settings.put;

  db.lospecPalettes.bulkPut = vi.fn(async (records) => {
    for (const record of records) {
      lospecPaletteStore.set(record.id, record);
    }
  }) as typeof db.lospecPalettes.bulkPut;
  db.lospecPalettes.orderBy = vi.fn(
    () =>
      ({
        reverse: () => ({
          toArray: async () =>
            [...lospecPaletteStore.values()].sort(
              (left, right) => right.publishedAtMs - left.publishedAtMs,
            ),
        }),
      }) as ReturnType<typeof db.lospecPalettes.orderBy>,
  ) as typeof db.lospecPalettes.orderBy;
  db.lospecPalettes.toCollection = vi.fn(
    () =>
      ({
        primaryKeys: async () => [...lospecPaletteStore.keys()],
      }) as ReturnType<typeof db.lospecPalettes.toCollection>,
  ) as typeof db.lospecPalettes.toCollection;

  db.quickExportPreferences.put = vi.fn(async (record) => {
    preferenceStore.set(
      record.id,
      record as typeof preferenceStore extends Map<unknown, infer V>
        ? V
        : never,
    );
  }) as typeof db.quickExportPreferences.put;
  db.quickExportPreferences.get = vi.fn(async (id) =>
    preferenceStore.get(id as string),
  ) as typeof db.quickExportPreferences.get;
  db.quickExportPreferences.delete = vi.fn(async (id) => {
    preferenceStore.delete(id as string);
  }) as typeof db.quickExportPreferences.delete;
  db.quickExportPreferences.where = vi.fn(
    () =>
      ({
        equals: (projectId: string) => ({
          delete: async () => {
            for (const [key, record] of preferenceStore) {
              if (record.projectId === projectId) {
                preferenceStore.delete(key);
              }
            }
          },
        }),
      }) as ReturnType<typeof db.quickExportPreferences.where>,
  ) as typeof db.quickExportPreferences.where;

  db.quickExportSaveTargets.put = vi.fn(async (record) => {
    saveTargetStore.set(
      record.id,
      record as typeof saveTargetStore extends Map<unknown, infer V>
        ? V
        : never,
    );
  }) as typeof db.quickExportSaveTargets.put;
  db.quickExportSaveTargets.get = vi.fn(async (id) =>
    saveTargetStore.get(id as string),
  ) as typeof db.quickExportSaveTargets.get;
  db.quickExportSaveTargets.delete = vi.fn(async (id) => {
    saveTargetStore.delete(id as string);
  }) as typeof db.quickExportSaveTargets.delete;
  db.quickExportSaveTargets.where = vi.fn(
    () =>
      ({
        equals: (projectId: string) => ({
          delete: async () => {
            for (const [key, record] of saveTargetStore) {
              if (record.projectId === projectId) {
                saveTargetStore.delete(key);
              }
            }
          },
        }),
      }) as ReturnType<typeof db.quickExportSaveTargets.where>,
  ) as typeof db.quickExportSaveTargets.where;

  return {
    assetStore,
    projectStore,
    lospecPaletteStore,
    preferenceStore,
    saveTargetStore,
    settingsStore,
    restore() {
      db.assets.put = originals.assets.put;
      db.assets.get = originals.assets.get;
      db.assets.delete = originals.assets.delete;
      db.assets.bulkDelete = originals.assets.bulkDelete;
      db.assets.toCollection = originals.assets.toCollection;
      db.projects.put = originals.projects.put;
      db.projects.get = originals.projects.get;
      db.projects.delete = originals.projects.delete;
      db.projects.toArray = originals.projects.toArray;
      db.projects.orderBy = originals.projects.orderBy;
      db.settings.get = originals.settings.get;
      db.settings.put = originals.settings.put;
      db.lospecPalettes.bulkPut = originals.lospecPalettes.bulkPut;
      db.lospecPalettes.orderBy = originals.lospecPalettes.orderBy;
      db.lospecPalettes.toCollection = originals.lospecPalettes.toCollection;
      db.quickExportPreferences.put = originals.quickExportPreferences.put;
      db.quickExportPreferences.get = originals.quickExportPreferences.get;
      db.quickExportPreferences.delete =
        originals.quickExportPreferences.delete;
      db.quickExportPreferences.where = originals.quickExportPreferences.where;
      db.quickExportSaveTargets.put = originals.quickExportSaveTargets.put;
      db.quickExportSaveTargets.get = originals.quickExportSaveTargets.get;
      db.quickExportSaveTargets.delete =
        originals.quickExportSaveTargets.delete;
      db.quickExportSaveTargets.where = originals.quickExportSaveTargets.where;
    },
  };
}

function createProjectFixture() {
  const tileset = {
    id: "tileset-1" as Tileset["id"],
    name: "Main",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 0 as Tileset["tileSize"],
    assetId: "asset-keep" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 32,
    createdAt: 1,
  } as Tileset;
  const imageLayer = {
    id: "image-1" as ImageLayer["id"],
    mapId: "map-1" as ImageLayer["mapId"],
    name: "Backdrop",
    type: "image",
    visible: true,
    locked: false,
    assetId: "asset-live" as ImageLayer["assetId"],
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    rotation: 45 as ImageLayer["rotation"],
    flipX: false,
    flipY: true,
    opacity: 140,
  } as ImageLayer;
  const objectLayer = {
    id: "object-layer-1" as ObjectLayer["id"],
    mapId: "map-1" as ObjectLayer["mapId"],
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: ["object-text" as MapObject["id"]],
  } as ObjectLayer;
  const object = {
    id: "object-text" as MapObject["id"],
    layerId: objectLayer.id,
    name: "Note",
    type: "text",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    visible: true,
    locked: false,
    properties: {
      Text: { value: "Hello", type: "string" },
      Size: { value: "12", type: "int" },
      Rotation: { value: "30", type: "float" },
      Font: { value: "", type: "string" },
      "Word wrap": { value: "true", type: "bool" },
      Color: { value: "", type: "color" },
    },
  } as MapObject;

  return {
    id: "project-1" as Project["id"],
    name: "Demo",
    createdAt: 1,
    updatedAt: 2,
    tileSize: undefined,
    tilesetGroups: [],
    tilesets: [tileset],
    mapGroups: [],
    maps: [
      {
        id: "map-1" as TileMapData["id"],
        name: "Map",
        groupId: "group-1" as TileMapData["groupId"],
        orientation: undefined,
        widthInTiles: 1,
        heightInTiles: 1,
        tileSize: 16,
        layerOrder: [],
        createdAt: 1,
      } as TileMapData,
    ],
    layers: [],
    imageLayers: [imageLayer],
    layerGroups: [],
    terrains: [],
    objectLayers: [objectLayer],
    objects: [object],
    overrideTilesets: [],
  } as unknown as Project;
}

test("asset helpers save, read, delete, clean orphaned assets, and create object URLs", async () => {
  const tables = installDbTableStubs();
  const liveProject = createProjectFixture();
  URL.createObjectURL = vi.fn(() => "blob:asset") as typeof URL.createObjectURL;

  try {
    await saveAsset(
      "asset-temp" as Tileset["assetId"],
      new Uint8Array([1, 2]).buffer,
      "image/png",
    );
    assert.strictEqual(
      (await getAsset("asset-temp" as Tileset["assetId"]))?.mimeType,
      "image/png",
    );

    await deleteAsset("asset-temp" as Tileset["assetId"]);
    assert.strictEqual(
      await getAsset("asset-temp" as Tileset["assetId"]),
      undefined,
    );

    tables.assetStore.set("asset-keep", {
      id: "asset-keep",
      data: new Uint8Array([1]).buffer,
      mimeType: "image/png",
      createdAt: 1,
    });
    tables.assetStore.set("asset-live", {
      id: "asset-live",
      data: new Uint8Array([2]).buffer,
      mimeType: "image/png",
      createdAt: 1,
    });
    tables.assetStore.set("asset-orphan", {
      id: "asset-orphan",
      data: new Uint8Array([3]).buffer,
      mimeType: "image/png",
      createdAt: 1,
    });
    tables.projectStore.set("saved-project", {
      id: "saved-project",
      name: "Saved",
      data: JSON.stringify({
        tilesets: [{ assetId: "asset-keep" }],
        imageLayers: [],
      }),
      updatedAt: 1,
    });
    tables.projectStore.set("corrupt-project", {
      id: "corrupt-project",
      name: "Broken",
      data: "{not-json",
      updatedAt: 0,
    });

    await cleanOrphanedAssets(liveProject);
    assert.strictEqual(tables.assetStore.has("asset-keep"), true);
    assert.strictEqual(tables.assetStore.has("asset-live"), true);
    assert.strictEqual(tables.assetStore.has("asset-orphan"), false);

    const assetUrl = await getAssetUrl("asset-keep" as Tileset["assetId"]);
    assert.strictEqual(assetUrl, "blob:asset");
    assert.strictEqual(
      await getAssetUrl("missing" as Tileset["assetId"]),
      null,
    );

    await deleteAssets([
      "asset-keep" as Tileset["assetId"],
      "asset-live" as Tileset["assetId"],
    ]);
    assert.strictEqual(tables.assetStore.size, 0);
  } finally {
    tables.restore();
  }
});

test("project, quick-export, and settings helpers persist normalized records and clean project-scoped data", async () => {
  const tables = installDbTableStubs();
  const project = createProjectFixture();
  const dispatchedEvents: string[] = [];
  Object.assign(globalThis, {
    window: {
      dispatchEvent: vi.fn((event: Event) => {
        dispatchedEvents.push((event as CustomEvent).type);
      }),
    },
  });

  try {
    await saveProject(project);
    assert.deepEqual(dispatchedEvents, [
      "project-save-start",
      "project-save-success",
      "project-save-end",
    ]);

    const successfulProjectPut = db.projects.put;
    db.projects.put = vi.fn(async () => {
      throw new Error("quota exceeded");
    }) as typeof db.projects.put;
    dispatchedEvents.length = 0;
    let saveFailure: unknown = null;
    try {
      await saveProject(project);
    } catch (error) {
      saveFailure = error;
    }
    assert.ok(saveFailure instanceof Error);
    assert.strictEqual(saveFailure.message, "quota exceeded");
    assert.deepEqual(dispatchedEvents, [
      "project-save-start",
      "project-save-end",
    ]);
    db.projects.put = successfulProjectPut;
    dispatchedEvents.length = 0;

    tables.projectStore.set("project-2", {
      id: "project-2",
      name: "Second",
      data: JSON.stringify(project),
      updatedAt: 10,
    });

    const loaded = await getProject(project.id);
    assert.strictEqual(loaded?.tileSize, 32);
    assert.strictEqual(loaded?.imageLayers[0]?.opacity, 100);
    assert.strictEqual(loaded?.objects[0]?.width, 96);

    const listed = await listProjects();
    assert.deepEqual(
      listed.map((record) => record.id),
      ["project-1", "project-2"],
    );

    await saveQuickExportPreference({
      projectId: project.id,
      assetType: "map",
      assetId: "map-1",
      optionId: "map-tide",
    });
    await saveQuickExportSaveTarget({
      projectId: project.id,
      assetType: "tileset",
      assetId: "tileset-1",
      optionId: "tileset-tiled",
      directoryHandle: null,
      fileHandle: null,
      fileName: "tileset.tsx.zip",
    });

    assert.strictEqual(
      (await loadQuickExportPreference(project.id, "map", "map-1"))?.id,
      `${project.id}:map:map-1`,
    );
    assert.strictEqual(
      (
        await loadQuickExportSaveTarget(
          project.id,
          "tileset",
          "tileset-1",
          "tileset-tiled",
        )
      )?.id,
      `${project.id}:tileset:tileset-1:tileset-tiled`,
    );

    await deleteQuickExportPreference(project.id, "map", "map-1");
    await deleteQuickExportSaveTarget(
      project.id,
      "tileset",
      "tileset-1",
      "tileset-tiled",
    );
    assert.strictEqual(tables.preferenceStore.size, 0);
    assert.strictEqual(tables.saveTargetStore.size, 0);

    assert.deepEqual(await getSettings(), { autoSaveEnabled: true });
    await saveSettings({ autoSaveEnabled: false });
    assert.deepEqual(await getSettings(), { autoSaveEnabled: false });

    tables.preferenceStore.set("pref-1", {
      id: "pref-1",
      projectId: project.id,
      assetType: "map",
      assetId: "map-1",
      updatedAt: 1,
    });
    tables.saveTargetStore.set("target-1", {
      id: "target-1",
      projectId: project.id,
      assetType: "map",
      assetId: "map-1",
      optionId: "map-tide",
      updatedAt: 1,
    });

    await deleteProject(project.id);
    assert.strictEqual(tables.projectStore.has(project.id), false);
    assert.strictEqual(tables.preferenceStore.size, 0);
    assert.strictEqual(tables.saveTargetStore.size, 0);
    assert.strictEqual(tables.assetStore.has("asset-keep"), false);
  } finally {
    tables.restore();
  }
});

test("lospec palette cache helpers persist records and return newest palettes first", async () => {
  const tables = installDbTableStubs();
  const olderPalette: LospecPaletteRecord = {
    id: "lospec-old",
    title: "Older Palette",
    slug: "older-palette",
    description: "Older entry",
    tags: ["retro"],
    user: "artist-old",
    colors: [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ],
    colorHexes: ["000000", "ffffff"],
    examples: [{ image: "https://example.com/old.png", description: "Old" }],
    publishedAt: "2026-05-01T00:00:00.000Z",
    publishedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
    cachedAt: 1,
  };
  const newerPalette: LospecPaletteRecord = {
    id: "lospec-new",
    title: "Newer Palette",
    slug: "newer-palette",
    description: "Newer entry",
    tags: ["bright", "vivid"],
    user: "artist-new",
    colors: [{ r: 16, g: 32, b: 48, a: 255 }],
    colorHexes: ["102030"],
    examples: [{ image: "https://example.com/new.png", description: "New" }],
    publishedAt: "2026-05-06T00:00:00.000Z",
    publishedAtMs: Date.parse("2026-05-06T00:00:00.000Z"),
    cachedAt: 2,
  };

  try {
    await saveLospecPaletteCache([olderPalette, newerPalette]);

    assert.deepEqual(await loadLospecPaletteCacheIds(), [
      "lospec-old",
      "lospec-new",
    ]);

    const palettes = await loadLospecPaletteCache();
    assert.deepEqual(
      palettes.map((palette) => palette.id),
      ["lospec-new", "lospec-old"],
    );
    assert.notStrictEqual(palettes[0], newerPalette);
    assert.deepEqual(tables.lospecPaletteStore.get("lospec-new"), newerPalette);
  } finally {
    tables.restore();
  }
});

test("localStorage-backed helpers read, write, and tolerate storage failures", async () => {
  const { localStorageMock } = installLocalStorageMock();
  const palettes: Palette[] = [
    {
      id: "palette-1" as Palette["id"],
      name: "Main",
      colors: [{ r: 0, g: 0, b: 0, a: 255 }],
    },
  ];

  saveProjectPrefs("project-1", { sidebarOpen: true });
  assert.deepEqual(loadProjectPrefs("project-1"), { sidebarOpen: true });
  deleteProjectPrefs("project-1");
  assert.strictEqual(loadProjectPrefs("project-1"), null);

  saveLastProjectId("project-2");
  assert.strictEqual(loadLastProjectId(), "project-2");

  savePaletteLibrary("project-3", palettes);
  assert.deepEqual(loadPaletteLibrary("project-3"), palettes);
  deletePaletteLibrary("project-3");
  assert.strictEqual(loadPaletteLibrary("project-3"), null);

  Object.assign(globalThis, {
    localStorage: {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      removeItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    },
  });

  saveProjectPrefs("project-4", { sidebarOpen: false });
  saveLastProjectId("project-4");
  savePaletteLibrary("project-4", palettes);
  deleteProjectPrefs("project-4");
  deletePaletteLibrary("project-4");
  assert.strictEqual(loadProjectPrefs("project-4"), null);
  assert.strictEqual(loadLastProjectId(), null);
  assert.strictEqual(loadPaletteLibrary("project-4"), null);

  Object.assign(globalThis, { localStorage: localStorageMock });
});
