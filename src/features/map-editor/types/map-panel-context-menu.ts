import type {
  ImageLayer,
  MapObject,
  ObjectId,
  TileLayer,
  TileMapData,
} from "@/types/map/schema";
import type {
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  RefObject,
} from "react";

export type OrientAction = "rotateLeft" | "rotateRight" | "flipH" | "flipV";

export interface MapCanvasContextMenuTile {
  x: number;
  y: number;
}

export interface UseMapCanvasContextMenuParams {
  containerRef: RefObject<HTMLDivElement | null>;
  activeMap: TileMapData | null;
  activeTileLayer: TileLayer | null;
  activeImageLayer: ImageLayer | null;
  activeLayerId: string | null;
  mapZoom: number;
  objects: MapObject[];
  onSelectObject: (objectId: ObjectId | null) => void;
}

export interface UseMapCanvasContextMenuResult {
  contextMenuTileRef: MutableRefObject<MapCanvasContextMenuTile | null>;
  hoverTileRef: MutableRefObject<MapCanvasContextMenuTile | null>;
  contextMenuObjectId: ObjectId | null;
  hasContextMenuTile: boolean;
  hasContextMenuImageLayer: boolean;
  hasContextMenuObject: boolean;
  handleMapContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => void;
  handleMapMouseMove: (e: ReactMouseEvent<HTMLDivElement>) => void;
  clearHoverTile: () => void;
}

export interface MapCanvasContextMenuContentProps {
  canCopy: boolean;
  canCut: boolean;
  canDeleteSelection: boolean;
  canPaste: boolean;
  canEditInImageEditor: boolean;
  canOrientContextMenu: boolean;
  hasContextMenuObject: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onPaste: () => void;
  onEditInImageEditor: () => void;
  onEditObjectProperties: () => void;
  onOrientSelection: (action: OrientAction) => void;
}
