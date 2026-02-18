import type {
  TileMapData,
  TileLayer,
  ImageLayer,
  ObjectLayer,
  MapObject,
  ObjectType,
  TileRef,
  EditorState,
  MapSelection,
} from "@/types";

export type ResizeHandle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

export interface MapCanvasProps {
  map: TileMapData;
  layers: TileLayer[];
  tilesets: EditorState["project"] extends infer P
    ? P extends { tilesets: infer T }
      ? T
      : never
    : never;
  zoom: number;
  activeLayerId: string | null;
  currentTool: EditorState["currentTool"];
  brushSize: EditorState["brushSize"];
  selectedTile: EditorState["selectedTile"];
  onPaintTile: (gx: number, gy: number) => void;
  onPaintEnd: () => void;
  /** Uncommitted tile changes for instant visual feedback during a stroke */
  paintBuffer: Map<string, TileRef | null>;
  /** Incremented to trigger re-render when buffer contents change */
  paintBufferVersion: number;
  /** Current selection rectangle (tile coords), null if none */
  mapSelection: MapSelection | null;
  /** Called when user creates/modifies the selection */
  onSelectionChange: (selection: MapSelection | null) => void;
  /** Called when user drops a moved selection — moves tiles from src to dest */
  onMoveTiles: (src: MapSelection, destX: number, destY: number) => void;
  /** Image layers to render (already flattened with visibility applied) */
  imageLayers: ImageLayer[];
  /** Called when an image layer is moved via drag */
  onMoveImageLayer: (layerId: string, x: number, y: number) => void;
  /** Called when an image layer is resized via drag handles */
  onResizeImageLayer: (
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  /** Object layers to render (already flattened with visibility applied) */
  objectLayers: ObjectLayer[];
  /** All map objects belonging to visible object layers */
  objects: MapObject[];
  /** Currently selected object ID */
  activeObjectId: string | null;
  /** Pending object type being placed (null if not placing) */
  pendingObjectType: ObjectType | null;
  /** Called when a new object is placed on the canvas */
  onCreateObject: (
    type: ObjectType,
    x: number,
    y: number,
    width: number,
    height: number,
    points: { x: number; y: number }[],
  ) => void;
  /** Called when an object is moved */
  onMoveObject: (objectId: string, x: number, y: number) => void;
  /** Called when an object is resized */
  onResizeObject: (
    objectId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  /** Called when polygon points are updated */
  onUpdatePolygonPoints: (
    objectId: string,
    points: { x: number; y: number }[],
  ) => void;
  /** Called when an object is selected/deselected on canvas */
  onSelectObject: (objectId: string | null) => void;
  /** Called when user cancels pending object placement (e.g. Escape during polygon drawing) */
  onCancelPendingObject?: () => void;
  /** Called when an object is double-clicked on canvas (to open properties) */
  onDoubleClickObject?: (objectId: string) => void;
}
