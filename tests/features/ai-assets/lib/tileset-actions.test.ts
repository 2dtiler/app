import { assert, test } from "vitest";
import { appendGeneratedImageTileset } from "@/features/ai-assets/lib/tileset-actions";
import { DEFAULT_EDITOR_STATE } from "@/types";
import type {
  AiGeneratedImageRecord,
  EditorState,
  Project,
  TilesetGroup,
} from "@/types";

test("appends a generated image as a selected tileset", () => {
  const group = {
    id: "group-1",
    name: "Main",
    order: 0,
  } as TilesetGroup;
  const draft = {
    ...DEFAULT_EDITOR_STATE,
    activeTilesetGroupId: group.id,
    tileSize: 32,
    project: {
      id: "project-1",
      name: "Demo",
      createdAt: 1,
      updatedAt: 1,
      tileSize: 32,
      tilesetGroups: [group],
      tilesets: [],
      mapGroups: [],
      maps: [],
      layers: [],
      imageLayers: [],
      layerGroups: [],
      terrains: [],
      objectLayers: [],
      objects: [],
      overrideTilesets: [],
    } as Project,
  } as EditorState;
  const record = {
    id: "record-1",
    data: new Uint8Array([1]).buffer,
    mimeType: "image/png",
    prompt: "grass",
    provider: "huggingface",
    modelId: "model",
    modelLabel: "Model",
    width: 64,
    height: 64,
    createdAt: 10,
    savedAt: null,
  } as AiGeneratedImageRecord;

  const didAppend = appendGeneratedImageTileset(
    draft,
    record,
    "asset-1" as Project["tilesets"][number]["assetId"],
    "tileset-1" as Project["tilesets"][number]["id"],
    20,
  );

  assert.strictEqual(didAppend, true);
  assert.strictEqual(draft.project?.tilesets.length, 1);
  assert.strictEqual(draft.project?.tilesets[0]?.assetId, "asset-1");
  assert.strictEqual(draft.project?.tilesets[0]?.imageWidth, 64);
  assert.strictEqual(draft.activeTilesetId, "tileset-1");
});
