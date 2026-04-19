import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type {
  EditorState,
  ImageLayer,
  MapObject,
  MapSelection,
  ObjectLayer,
  ObjectType,
  TileLayer,
  TileMapData,
  TileRef,
} from "./schema";
import type {
  TextObjectEditingState,
  TextObjectMapObject,
} from "./text-object";

export interface MapCanvasImperativeHandle {
  drawBufferTile: (gx: number, gy: number, ref: TileRef) => void;
  eraseBufferTile: (gx: number, gy: number) => void;
  clearPaintCanvas: () => void;
}

export type ResizeHandle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

export type MapResizeHandle = "e" | "s" | "se";

export interface MapResizePreview {
  width: number;
  height: number;
}

export interface MapResizeAction {
  handle: MapResizeHandle;
  startClientX: number;
  startClientY: number;
  origWidth: number;
  origHeight: number;
  nextWidth: number;
  nextHeight: number;
}

export interface UseMapResizeParams {
  mapWidth: number;
  mapHeight: number;
  scaledTile: number;
  onResizeMap: (width: number, height: number) => void;
}

export interface UseMapResizeReturn {
  activeMapResizeHandle: MapResizeHandle | null;
  hoveredMapResizeHandle: MapResizeHandle | null;
  mapResizeActionRef: MutableRefObject<MapResizeAction | null>;
  mapResizePreview: MapResizePreview | null;
  previewWidth: number;
  previewHeight: number;
  beginMapResize: (
    handle: MapResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  isResizing: boolean;
  setHoveredMapResizeHandle: Dispatch<SetStateAction<MapResizeHandle | null>>;
}

export interface MapResizeControlsProps {
  canvasW: number;
  canvasH: number;
  previewWidth: number;
  previewHeight: number;
  activeHandle: MapResizeHandle | null;
  hoveredHandle: MapResizeHandle | null;
  mapResizePreview: MapResizePreview | null;
  isResizing: boolean;
  onHoverHandleChange: (handle: MapResizeHandle | null) => void;
  onBeginMapResize: UseMapResizeReturn["beginMapResize"];
}

export interface MapCanvasProps {
  map: TileMapData;
  layers: TileLayer[];
  tilesets: NonNullable<EditorState["project"]>["tilesets"];
  zoom: number;
  activeLayerId: string | null;
  currentTool: EditorState["currentTool"];
  fillMode: EditorState["fillMode"];
  activeFillTerrain: EditorState["activeFillTerrain"];
  canPreviewFill: boolean;
  brushSize: EditorState["brushSize"];
  selectedTileSize: EditorState["tileSize"];
  selectedTile: EditorState["selectedTile"];
  onResizeMap: (width: number, height: number) => void;
  onPaintTile: (gx: number, gy: number) => void;
  onPaintEnd: () => void;
  paintBuffer: Map<string, TileRef | null>;
  paintBufferVersion: number;
  imperativeRef?: RefObject<MapCanvasImperativeHandle | null>;
  mapSelection: MapSelection | null;
  onSelectionChange: (selection: MapSelection | null) => void;
  onMoveTiles: (src: MapSelection, destX: number, destY: number) => void;
  imageLayers: ImageLayer[];
  onMoveImageLayer: (layerId: string, x: number, y: number) => void;
  onResizeImageLayer: (
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  objectLayers: ObjectLayer[];
  objects: MapObject[];
  activeObjectId: string | null;
  pendingObjectType: ObjectType | null;
  onCreateObject: (
    type: ObjectType,
    x: number,
    y: number,
    width: number,
    height: number,
    points: { x: number; y: number }[],
  ) => void;
  onMoveObject: (objectId: string, x: number, y: number) => void;
  onResizeObject: (
    objectId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  onUpdatePolygonPoints: (
    objectId: string,
    points: { x: number; y: number }[],
  ) => void;
  onSelectObject: (objectId: string | null) => void;
  editingTextObject: TextObjectEditingState | null;
  onEditingTextChange: (text: string) => void;
  onCommitTextEditing: () => void;
  onCancelTextEditing: () => void;
  onCancelPendingObject?: () => void;
  onDoubleClickObject?: (objectId: string) => void;
}

export interface TextObjectEditorOverlayProps {
  object: TextObjectMapObject;
  text: string;
  zoom: number;
  onTextChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export type SelectionAction =
  | { type: "draw"; startX: number; startY: number }
  | {
      type: "move";
      offsetX: number;
      offsetY: number;
      orig: MapSelection;
      tiles: { dx: number; dy: number; ref: TileRef }[];
    };

export interface ImageDragAction {
  layerId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

export interface ImageResizeAction {
  layerId: string;
  handle: ResizeHandle;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  flipY: boolean;
}

export interface ObjectPlaceAction {
  type: ObjectType;
  startX: number;
  startY: number;
}

export interface ObjectDragAction {
  objectId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

export interface ObjectResizeAction {
  objectId: string;
  handle: ResizeHandle;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
}

export interface PolyVertexDragAction {
  objectId: string;
  vertexIndex: number;
  startX: number;
  startY: number;
  origPoint: { x: number; y: number };
}

export interface UseSceneInteractionParams {
  map: TileMapData;
  layers: TileLayer[];
  zoom: number;
  activeLayerId: string | null;
  currentTool: EditorState["currentTool"];
  fillMode: EditorState["fillMode"];
  activeFillTerrain: EditorState["activeFillTerrain"];
  canPreviewFill: boolean;
  brushSize: EditorState["brushSize"];
  selectedTileSize: EditorState["tileSize"];
  onPaintTile: MapCanvasProps["onPaintTile"];
  onPaintEnd: MapCanvasProps["onPaintEnd"];
  mapSelection: MapSelection | null;
  onSelectionChange: MapCanvasProps["onSelectionChange"];
  onMoveTiles: MapCanvasProps["onMoveTiles"];
  imageLayers: ImageLayer[];
  onMoveImageLayer: MapCanvasProps["onMoveImageLayer"];
  onResizeImageLayer: MapCanvasProps["onResizeImageLayer"];
  objectLayers: ObjectLayer[];
  objects: MapObject[];
  activeObjectId: string | null;
  pendingObjectType: ObjectType | null;
  onCreateObject: MapCanvasProps["onCreateObject"];
  onMoveObject: MapCanvasProps["onMoveObject"];
  onResizeObject: MapCanvasProps["onResizeObject"];
  onUpdatePolygonPoints: MapCanvasProps["onUpdatePolygonPoints"];
  onSelectObject: MapCanvasProps["onSelectObject"];
  onCancelPendingObject?: MapCanvasProps["onCancelPendingObject"];
  onDoubleClickObject?: MapCanvasProps["onDoubleClickObject"];
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  scaledTile: number;
  mapW: number;
  mapH: number;
  selectedTile: TileRef | null;
}

export interface UseSceneInteractionReturn {
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  renderedSelection: MapSelection | null;
  liveSelection: MapSelection | null;
  moveTilesSnapshot: { dx: number; dy: number; ref: TileRef }[] | null;
  liveImagePos: { layerId: string; x: number; y: number } | null;
  liveImageResize: {
    layerId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  liveObjectPos: { objectId: string; x: number; y: number } | null;
  liveObjectResize: {
    objectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  liveObjectPlace: {
    type: ObjectType;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  livePolyVertex: {
    objectId: string;
    vertexIndex: number;
    x: number;
    y: number;
  } | null;
  isDrawingPolygon: boolean;
  polygonPoints: { x: number; y: number }[];
  polygonCursorPos: { x: number; y: number } | null;
  isMoving: boolean;
  resizingHandle: ResizeHandle | null;
  hoveredHandle: ResizeHandle | null;
  hoveredObjectCursor: string | null;
  handlePointerDown: (e: { x: number; y: number; button?: number }) => void;
  handlePointerMove: (e: { x: number; y: number }) => void;
  handlePointerUp: (e?: { button?: number }) => void;
  handlePointerLeave: () => void;
}
