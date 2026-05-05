import type { AssetId, TileSize, TilesetId } from "@/types/map/schema";
import type {
  TilesetImageImportPosition,
  TilesetPlacementPreview,
} from "@/features/map-editor/types/tileset-import";
import type { DragEvent } from "react";

export interface TileRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface TilesetCanvasProps {
  assetId: AssetId | null;
  tileSize: TileSize;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  selectedTile: TileRegion | null;
  onTileSelect: (tile: TileRegion) => void;
  selectionMode?: "single" | "rectangle";
  className?: string;
  placeholder?: string;
  dragTilesetId?: TilesetId;
  onContextMenuTile?: (tx: number, ty: number) => void;
  placementPreview?: TilesetPlacementPreview | null;
  onPlacementChange?: (position: TilesetImageImportPosition) => void;
}

export interface BaseLayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type?: string;
}

export interface BaseLayerGroupItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
}

export interface GroupRowProps {
  group: BaseLayerGroupItem;
  depth: number;
  parentGroupId: string | null;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onToggleLock: (id: string, isGroup: boolean) => void;
  onMove: (
    id: string,
    dir: "up" | "down",
    parentGroupId: string | null,
  ) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  isDragging: boolean;
  dropIndicator: "above" | "below" | "inside" | null;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (
    event: DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (event: DragEvent) => void;
}

export interface LayerRowProps {
  layer: BaseLayerItem;
  depth: number;
  parentGroupId: string | null;
  isActive: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onToggleLock: (id: string, isGroup: boolean) => void;
  onSelect: (id: string) => void;
  onMove: (
    id: string,
    dir: "up" | "down",
    parentGroupId: string | null,
  ) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  isDragging: boolean;
  dropIndicator: "above" | "below" | "inside" | null;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (
    event: DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (event: DragEvent) => void;
}
