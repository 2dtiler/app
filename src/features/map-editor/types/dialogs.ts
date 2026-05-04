import type { ReactNode } from "react";
import type {
  AutotileConfig,
  AutotilePatternSlotId,
  AutotileTerrainId,
} from "@/types/map/autotile";
import type { AutotileWangSetId } from "@/types/map/autotile-wang";
import type { NewMapType } from "@/types/map/map-geometry";
import type {
  MapObject,
  ObjectId,
  PropertyType,
  PropertyValue,
  TerrainTile,
  TileMapData,
  Tileset,
} from "@/types/map/schema";
import type { TilesetAnimation } from "@/types/map/animation";

export interface AutotileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (autotile: AutotileConfig) => void;
  tileset: Tileset;
}

export interface AnimationDialogProps {
  animation?: TilesetAnimation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (animation: TilesetAnimation) => void;
  tileset: Tileset;
}

export type AutotileSelectionTarget =
  | { type: "terrain"; terrainId: AutotileTerrainId }
  | {
      type: "pattern";
      terrainId: AutotileTerrainId;
      slotId: AutotilePatternSlotId;
    }
  | { type: "wangSetTile"; wangSetId: AutotileWangSetId }
  | {
      type: "wangColorTile";
      wangSetId: AutotileWangSetId;
      colorIndex: number;
    }
  | {
      type: "wangTile";
      wangSetId: AutotileWangSetId;
      tileIndex: number;
    };

export interface FillTerrainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (tiles: TerrainTile[]) => void;
}

export type FindReplaceGridSize = 1 | 2 | 3 | 4 | 5;

export interface FindReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type AddLayerDialogLayerType = "tile" | "group" | "image" | "object";

export interface AddLayerDialogLayerTypeOption {
  type: AddLayerDialogLayerType;
  label: string;
  icon: ReactNode;
  description: string;
}

export interface AddLayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreateLayer: (name: string, type: AddLayerDialogLayerType) => void;
  onRequestImageLayer?: () => void;
  allowedTypes?: AddLayerDialogLayerType[];
}

export interface ObjectPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object: MapObject;
  onSave: (properties: Record<string, PropertyValue>, name?: string) => void;
}

export interface ObjectPropertiesDialogManagerProps {
  objectId: ObjectId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface EditablePropertyEntry {
  key: string;
  value: string;
  type: PropertyType;
}

export interface MapOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  map: TileMapData;
  onSave: (
    width: number,
    height: number,
    properties: Record<string, PropertyValue>,
  ) => void;
}

export interface NewMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  width: number;
  height: number;
  mapType: NewMapType;
  tileSize: number;
  onNameChange: (value: string) => void;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onMapTypeChange: (value: NewMapType) => void;
  onCreate: () => void;
}

export interface NewMapGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
}

export interface NewTilesetGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
}
