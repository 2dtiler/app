import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  EditorState,
  EditorTool,
  FillMode,
  ImageLayer,
  MapGroup,
  MapId,
  MapObject,
  ObjectId,
  ObjectLayer,
  PropertyValue,
  TerrainTile,
  TileLayer,
  TileMapData,
} from "./map/schema";
import type { NewMapType } from "./map/map-geometry";
import type { MapCanvasImperativeHandle, MapCanvasProps } from "./map-canvas";
import type {
  MapCanvasContextMenuTile,
  OrientAction,
} from "./map-panel-context-menu";
import type { TextObjectEditingState } from "./map/text-object";

export interface MapPanelDeleteTarget {
  type: "map" | "group";
  id: string;
  name: string;
}

export interface MapPanelHistoryControls {
  canBack: () => boolean;
  canForward: () => boolean;
  back: () => void;
  forward: () => void;
}

export interface MapPanelTextObjectEditingController {
  editing: TextObjectEditingState | null;
  startEditing: (objectId: ObjectId | string, text?: string) => void;
  updateText: (text: string) => void;
  commitEditing: () => void;
  cancelEditing: () => void;
}

export interface MapPanelToolbarProps {
  activeMap: TileMapData | undefined;
  canCutToolbar: boolean;
  canOrientToolbar: boolean;
  controls: MapPanelHistoryControls;
  mapZoom: number;
  onCut: () => Promise<void> | void;
  onOpenMapOptions: () => void;
  onOrientSelection: (action: OrientAction) => void;
  onSelectBrushTool: (
    tool: Extract<EditorTool, "paint" | "erase">,
    size: EditorState["brushSize"],
  ) => void;
  onSelectFillMode: (mode: FillMode) => void;
  onSelectTool: (tool: EditorTool) => void;
  onZoom: (direction: 1 | -1) => void;
  state: EditorState;
}

export interface MapPanelTabsProps {
  activeGroup: MapGroup | undefined;
  groupMaps: TileMapData[];
  onAddMap: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onDuplicateMap: (map: TileMapData) => void;
  onGroupChange: (value: string) => void;
  onRequestDeleteTarget: (target: MapPanelDeleteTarget) => void;
  onSelectMap: (mapId: MapId) => void;
  onStartRenamingTab: (map: TileMapData) => void;
  project: NonNullable<EditorState["project"]>;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameValue: string;
  renamingTabId: MapId | null;
  setRenameValue: Dispatch<SetStateAction<string>>;
  state: EditorState;
}

export interface MapPanelWorkspaceProps {
  activeLayerEffectivelyLocked: boolean;
  activeMap: TileMapData | undefined;
  canCopy: boolean;
  canCut: boolean;
  canDeleteSelection: boolean;
  canEditInImageEditor: boolean;
  canOrientContextMenu: boolean;
  canPaste: boolean;
  clearHoverTile: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  contextMenuObjectId: ObjectId | null;
  flatImageLayers: ImageLayer[];
  flatLayers: TileLayer[];
  flatMap: TileMapData | null;
  flatObjectLayers: ObjectLayer[];
  flatObjects: MapObject[];
  groupMaps: TileMapData[];
  handleMapContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleMapMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  hasContextMenuObject: boolean;
  mapCanvasRef: RefObject<MapCanvasImperativeHandle | null>;
  mapZoom: number;
  onCancelPendingObject: NonNullable<MapCanvasProps["onCancelPendingObject"]>;
  onCopySelection: (fromContextMenu?: boolean) => Promise<void>;
  onCreateObject: MapCanvasProps["onCreateObject"];
  onCutSelection: (fromContextMenu?: boolean) => Promise<void>;
  onDeleteSelection: (fromContextMenu?: boolean) => void;
  onEditInImageEditor: () => void;
  onOpenObjectProperties: (objectId: ObjectId) => void;
  onMoveImageLayer: MapCanvasProps["onMoveImageLayer"];
  onMoveObject: MapCanvasProps["onMoveObject"];
  onMoveTiles: MapCanvasProps["onMoveTiles"];
  onOrientSelection: (action: OrientAction, fromContextMenu?: boolean) => void;
  onPaintEnd: MapCanvasProps["onPaintEnd"];
  onPaintTile: MapCanvasProps["onPaintTile"];
  onPasteSelection: (fromContextMenu?: boolean) => Promise<void>;
  onResizeImageLayer: MapCanvasProps["onResizeImageLayer"];
  onResizeMap: MapCanvasProps["onResizeMap"];
  onResizeObject: MapCanvasProps["onResizeObject"];
  onSelectObject: (objectId: ObjectId | null) => void;
  onSelectionChange: MapCanvasProps["onSelectionChange"];
  onUpdatePolygonPoints: MapCanvasProps["onUpdatePolygonPoints"];
  paintBuffer: MapCanvasProps["paintBuffer"];
  paintBufferVersion: number;
  project: NonNullable<EditorState["project"]>;
  state: EditorState;
  textObjectEditing: MapPanelTextObjectEditingController;
}

export interface MapPanelDialogsProps {
  activeMap: TileMapData | undefined;
  addGroupOpen: boolean;
  addMapOpen: boolean;
  deleteTarget: MapPanelDeleteTarget | null;
  fillTerrainDialogOpen: boolean;
  mapOptionsOpen: boolean;
  newGroupName: string;
  newMapHeight: number;
  newMapName: string;
  newMapType: NewMapType;
  newMapWidth: number;
  onApplyTerrainFill: (tiles: TerrainTile[]) => void;
  onCreateGroup: () => void;
  onCreateMap: () => void;
  onDeleteConfirm: () => void;
  onUpdateMapOptions: (
    width: number,
    height: number,
    properties: Record<string, PropertyValue>,
  ) => void;
  propsObjectId: ObjectId | null;
  setAddGroupOpen: Dispatch<SetStateAction<boolean>>;
  setAddMapOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteTarget: Dispatch<SetStateAction<MapPanelDeleteTarget | null>>;
  setFillTerrainDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMapOptionsOpen: Dispatch<SetStateAction<boolean>>;
  setNewGroupName: Dispatch<SetStateAction<string>>;
  setNewMapHeight: Dispatch<SetStateAction<number>>;
  setNewMapName: Dispatch<SetStateAction<string>>;
  setNewMapType: Dispatch<SetStateAction<NewMapType>>;
  setNewMapWidth: Dispatch<SetStateAction<number>>;
  setPropsObjectId: Dispatch<SetStateAction<ObjectId | null>>;
  state: EditorState;
}

export interface MapPanelCanvasActionParams {
  activeImageLayer: ImageLayer | null;
  activeLayer: TileLayer | undefined;
  activeMap: TileMapData | undefined;
  contextMenuTileRef: React.MutableRefObject<MapCanvasContextMenuTile | null>;
  hasContextMenuImageLayer: boolean;
  layerGroups: NonNullable<EditorState["project"]>["layerGroups"];
  mapCanvasRef: RefObject<MapCanvasImperativeHandle | null>;
  paintBuffer: Map<
    string,
    MapCanvasProps["paintBuffer"] extends Map<string, infer TValue>
      ? TValue
      : never
  >;
  project: EditorState["project"];
  setPaintBufferVersion: Dispatch<SetStateAction<number>>;
  setState: ReturnType<typeof import("@/lib/store").getEditorStore>["setState"];
  state: EditorState;
  textObjectEditing: MapPanelTextObjectEditingController;
}

export interface MapPanelCanvasActionResult {
  handleCancelPendingObject: NonNullable<
    MapCanvasProps["onCancelPendingObject"]
  >;
  handleCreateObject: MapCanvasProps["onCreateObject"];
  handleEditInImageEditor: () => void;
  handleMoveImageLayer: MapCanvasProps["onMoveImageLayer"];
  handleMoveObject: MapCanvasProps["onMoveObject"];
  handleMoveTiles: MapCanvasProps["onMoveTiles"];
  handlePaintEnd: MapCanvasProps["onPaintEnd"];
  handlePaintTile: MapCanvasProps["onPaintTile"];
  handleResizeImageLayer: MapCanvasProps["onResizeImageLayer"];
  handleResizeObject: MapCanvasProps["onResizeObject"];
  handleSelectionChange: MapCanvasProps["onSelectionChange"];
  handleUpdatePolygonPoints: MapCanvasProps["onUpdatePolygonPoints"];
}

export interface MapPanelClipboardActionParams {
  activeImageLayer: ImageLayer | null;
  activeLayer: TileLayer | undefined;
  activeLayerEffectivelyLocked: boolean;
  activeMap: TileMapData | undefined;
  activeObject: MapObject | null;
  activeObjectLayer: ObjectLayer | null;
  contextMenuTileRef: React.MutableRefObject<MapCanvasContextMenuTile | null>;
  hasContextMenuImageLayer: boolean;
  hasContextMenuTile: boolean;
  hoverTileRef: React.MutableRefObject<MapCanvasContextMenuTile | null>;
  project: EditorState["project"];
  setState: ReturnType<typeof import("@/lib/store").getEditorStore>["setState"];
  state: EditorState;
}

export interface MapPanelClipboardActionResult {
  canCopy: boolean;
  canCut: boolean;
  canCutToolbar: boolean;
  canDeleteSelection: boolean;
  canEditInImageEditor: boolean;
  canOrientContextMenu: boolean;
  canOrientToolbar: boolean;
  canPaste: boolean;
  handleCopySelection: (fromContextMenu?: boolean) => Promise<void>;
  handleCutSelection: (fromContextMenu?: boolean) => Promise<void>;
  handleDeleteSelection: (fromContextMenu?: boolean) => void;
  handleOrientSelection: (
    action: OrientAction,
    fromContextMenu?: boolean,
  ) => void;
  handlePasteSelection: (fromContextMenu?: boolean) => Promise<void>;
}
