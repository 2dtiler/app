import type {
  LayerGroupId,
  LayerId,
  PropertyValue,
  TileLayer,
  TileRef,
  Tileset,
  TilesetGroupId,
  TilesetId,
} from "@/types";

export function clonePropertyValues(
  values: Record<string, PropertyValue> = {},
): Record<string, PropertyValue> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { ...value }]),
  );
}

export function remapLayerTreeId(
  id: LayerId | LayerGroupId,
  layerIdMap: ReadonlyMap<string, LayerId>,
  groupIdMap: ReadonlyMap<string, LayerGroupId>,
): LayerId | LayerGroupId {
  return (layerIdMap.get(id as string) ??
    groupIdMap.get(id as string) ??
    id) as LayerId | LayerGroupId;
}

export function remapTileEntries(
  tiles: TileLayer["tiles"],
  tilesetIdMap: ReadonlyMap<string, TilesetId>,
): TileLayer["tiles"] {
  return Object.fromEntries(
    Object.entries(tiles).map(([coordinate, ref]) => [
      coordinate,
      {
        ...ref,
        tilesetId: tilesetIdMap.get(ref.tilesetId as string) ?? ref.tilesetId,
      } satisfies TileRef,
    ]),
  );
}

export function cloneImportedTileset(
  tileset: Tileset,
  tilesetIdMap: ReadonlyMap<string, TilesetId>,
  groupId: TilesetGroupId,
): Tileset {
  return {
    ...tileset,
    id: tilesetIdMap.get(tileset.id as string) ?? tileset.id,
    groupId,
  };
}