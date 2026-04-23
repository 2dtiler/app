import type {
  AssetId,
  FillMode,
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  ObjectLayer,
  SelectedTile,
  TerrainTile,
  TileLayer,
  TileMapData,
  TileRef,
  TilesetId,
} from "../map/schema";
import type {
  ImageEditorGroupId,
  ImageEditorImageLayer,
  ImageEditorLayerGroup,
  ImageEditorRasterLayer,
} from "../image-editor";

export interface FillRegionOptions {
  map: TileMapData;
  layer: TileLayer;
  mapWidth: number;
  mapHeight: number;
  startX: number;
  startY: number;
  fillMode: FillMode;
  selectedTile: TileRef | null;
  activeFillTerrain: TerrainTile[] | null;
}

export interface TileStampCell {
  dx: number;
  dy: number;
  ref: TileRef;
}

export interface TileStamp {
  width: number;
  height: number;
  cells: TileStampCell[];
}

export type TileStampSource = Pick<
  SelectedTile,
  "tilesetId" | "sx" | "sy" | "sw" | "sh"
>;

export interface TileEditorContext {
  tilesetId: TilesetId;
  assetId: AssetId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  layerId: LayerId;
  tileX: number;
  tileY: number;
}

export interface ImageLayerEditorContext {
  layerId: LayerId;
  assetId: AssetId;
  width: number;
  height: number;
}

export interface ImageLayerClipboard {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  mimeType: string;
  data: ArrayBuffer;
  operation: "copy" | "cut";
}

export interface TileClipboard {
  tiles: { dx: number; dy: number; ref: TileRef }[];
  width: number;
  height: number;
}

export type LayerTreeNode =
  | {
      type: "layer";
      layer: TileLayer;
      depth: number;
      parentGroupId: LayerGroupId | null;
    }
  | {
      type: "imageLayer";
      layer: ImageLayer;
      depth: number;
      parentGroupId: LayerGroupId | null;
    }
  | {
      type: "objectLayer";
      layer: ObjectLayer;
      depth: number;
      parentGroupId: LayerGroupId | null;
    }
  | {
      type: "group";
      group: LayerGroup;
      depth: number;
      parentGroupId: LayerGroupId | null;
    };

export type ImageEditorLayerTreeNode =
  | {
      type: "rasterLayer";
      layer: ImageEditorRasterLayer;
      depth: number;
      parentGroupId: ImageEditorGroupId | null;
    }
  | {
      type: "imageLayer";
      layer: ImageEditorImageLayer;
      depth: number;
      parentGroupId: ImageEditorGroupId | null;
    }
  | {
      type: "group";
      group: ImageEditorLayerGroup;
      depth: number;
      parentGroupId: ImageEditorGroupId | null;
    };
