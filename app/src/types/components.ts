/**
 * Type definitions for reusable components.
 * Component-specific prop types and context types.
 */

import type { CSSProperties, HTMLAttributes } from "react";
import type { TilesetId, TileSize, AssetId } from "./schema";

// ---------------------------------------------------------------------------
// Tileset Canvas
// ---------------------------------------------------------------------------

/** Pixel region within a tileset (no tilesetId — the parent knows which tileset) */
export interface TileRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface TilesetCanvasProps {
  /** The IndexedDB asset ID for the tileset image. Null hides the canvas. */
  assetId: AssetId | null;
  /** Tile size in pixels used to draw the grid */
  tileSize: TileSize;
  /** Current zoom level (0.5 – 4) */
  zoom: number;
  /** Called when the user changes zoom via Ctrl+Wheel */
  onZoomChange: (zoom: number) => void;
  /** Currently highlighted tile (orange border). Coordinates are in pixels. */
  selectedTile: TileRegion | null;
  /** Called when the user clicks a tile */
  onTileSelect: (tile: TileRegion) => void;
  /** Selection interaction mode. Rectangle mode is opt-in for the main editor. */
  selectionMode?: "single" | "rectangle";
  /** Additional CSS classes for the outer container */
  className?: string;
  /** Placeholder text when no image is loaded */
  placeholder?: string;
  /**
   * When set, enables native HTML drag on tiles. The dragged data will
   * include the tilesetId so drop targets know which tileset the tile
   * comes from. Used by the Find & Replace dialog.
   */
  dragTilesetId?: TilesetId;
  /**
   * Called when the user right-clicks a tile. Receives tile grid coordinates
   * (column, row). If provided, right-clicks will NOT propagate a native
   * context menu — the parent should handle that via ContextMenuTrigger.
   */
  onContextMenuTile?: (tx: number, ty: number) => void;
}

// ---------------------------------------------------------------------------
// Color Picker
// ---------------------------------------------------------------------------

export type ColorPickerContextValue = {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  mode: string;
  setHue: (hue: number) => void;
  setSaturation: (saturation: number) => void;
  setLightness: (lightness: number) => void;
  setAlpha: (alpha: number) => void;
  setMode: (mode: string) => void;
};

export type ColorPickerProps = HTMLAttributes<HTMLDivElement> & {
  value?: unknown; // Parameters<typeof Color>[0]
  defaultValue?: unknown; // Parameters<typeof Color>[0]
  onChange?: (value: [number, number, number, number]) => void;
};

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>;

export type ColorPickerHueProps = {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  max?: number;
  step?: number;
  dir?: "ltr" | "rtl";
  className?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
  style?: CSSProperties;
};

export type ColorPickerAlphaProps = {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  max?: number;
  step?: number;
  dir?: "ltr" | "rtl";
  className?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
  style?: CSSProperties;
};

export type ColorPickerEyeDropperProps = {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
} & HTMLAttributes<HTMLButtonElement>;

export type ColorPickerOutputProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
} & HTMLAttributes<HTMLButtonElement>;

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>;

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export type ToolName = "image-editor" | "ai-assets";

export interface ToolbarProps {
  onNewProject: () => void;
  onSaveProject: () => void;
  onImportProject: () => void;
  onImportMap: () => void;
  onImportTileset: () => void;
  onExportProject: () => void;
  onExportMap: () => void;
  onExportTileset: () => void;
  onOpenSettings: () => void;
  onAbout: () => void;
  onKeyboardShortcuts: () => void;
  onSubmitBug: () => void;
  onFindReplace: () => void;
  onOpenTool: (tool: ToolName) => void;
}

// ---------------------------------------------------------------------------
// Layers Panel - Base Types (generic enough for both map and image editor)
// ---------------------------------------------------------------------------

/**
 * Minimum shape that both map layers and image-editor layers satisfy.
 * Used by LayerRow so it can render layers from either context.
 */
export interface BaseLayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Optional type string — used for the icon ("image", "object", etc.) */
  type?: string;
}

/**
 * Minimum shape that both map layer groups and image-editor layer groups satisfy.
 * Used by GroupRow so it can render groups from either context.
 */
export interface BaseLayerGroupItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
}

// ---------------------------------------------------------------------------
// Layers Panel - Layer Row
// ---------------------------------------------------------------------------

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
  // Drag & Drop
  isDragging: boolean;
  dropIndicator: "above" | "below" | "inside" | null;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (
    e: React.DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (e: React.DragEvent) => void;
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
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onToggleLock: (id: string, isGroup: boolean) => void;
  onMove: (
    id: string,
    dir: "up" | "down",
    parentGroupId: string | null,
  ) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  // Drag & Drop
  isDragging: boolean;
  dropIndicator: "above" | "below" | "inside" | null;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (
    e: React.DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (e: React.DragEvent) => void;
}
