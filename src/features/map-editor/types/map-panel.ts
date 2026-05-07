import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  EditorState,
  EditorTool,
  FillMode,
  ImageLayer,
  MapGroup,
  MapGroupId,
  MapId,
  MapObject,
  ObjectId,
  ObjectLayer,
  PaintMode,
  PropertyValue,
  TerrainId,
  TerrainTile,
  TileLayer,
  TileMapData,
} from "@/types/map/schema";
import type { QuickExportControlState } from "@/types";
import type { NewMapType } from "@/types/map/map-geometry";
import type { TextObjectEditingState } from "@/types/map/text-object";
import type {
  AssetManagerGroupDropPosition,
  AssetManagerGroupViewModel,
  AssetManagerItemDropPosition,
  AssetManagerItemViewModel,
} from "./asset-manager";
import type { MapCanvasImperativeHandle, MapCanvasProps } from "./map-canvas";
import type { AppliedTerrainSelection, TerrainToolTarget } from "./dialogs";
import type {
  MapCanvasContextMenuTile,
  OrientAction,
} from "./map-panel-context-menu";

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
  onSelectPaintMode: (mode: PaintMode) => void;
  onSelectPaintTerrain: (
    terrainId: TerrainId,
    size: EditorState["brushSize"],
  ) => void;
  onSelectAutotileTool: (
    terrainId: NonNullable<EditorState["selectedAutotileTerrain"]>["terrainId"],
    size: EditorState["brushSize"],
  ) => void;
  onSelectFillMode: (mode: FillMode) => void;
  onSelectFillTerrain: (terrainId: TerrainId) => void;
  onOpenTerrainDialog: (target: TerrainToolTarget) => void;
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

export interface ManageMapsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: AssetManagerGroupViewModel[];
  maps: AssetManagerItemViewModel[];
  selectedGroupId: MapGroupId | null;
  onSelectedGroupChange: (groupId: MapGroupId) => void;
  onCreateGroup: () => void;
  onCreateMap: (groupId: MapGroupId) => void;
  onRenameGroup: (groupId: MapGroupId, name: string) => void;
  onDeleteGroup: (groupId: MapGroupId) => void;
  onRenameMap: (mapId: MapId, name: string) => void;
  onDeleteMap: (mapId: MapId) => void;
  onReorderGroups: (
    dragId: MapGroupId,
    targetId: MapGroupId,
    position: Exclude<AssetManagerGroupDropPosition, "inside">,
  ) => void;
  onMoveMapToGroup: (mapId: MapId, targetGroupId: MapGroupId) => void;
  onReorderMaps: (
    dragId: MapId,
    targetId: MapId,
    position: AssetManagerItemDropPosition,
  ) => void;
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
  onImportMapFromFile: (file: File) => Promise<boolean>;
  onOpenObjectProperties: (objectId: ObjectId) => void;
  onMoveImageLayer: MapCanvasProps["onMoveImageLayer"];
  onMoveObject: MapCanvasProps["onMoveObject"];
  onMoveTiles: MapCanvasProps["onMoveTiles"];
  onOrientSelection: (action: OrientAction, fromContextMenu?: boolean) => void;
  onPaintEnd: MapCanvasProps["onPaintEnd"];
  onPaintTile: MapCanvasProps["onPaintTile"];
  onPlaceAnimation: MapCanvasProps["onPlaceAnimation"];
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
  quickExportControl: QuickExportControlState;
  state: EditorState;
  textObjectEditing: MapPanelTextObjectEditingController;
}

export interface MapPanelDialogsProps {
  activeMap: TileMapData | undefined;
  addGroupOpen: boolean;
  addMapOpen: boolean;
  deleteTarget: MapPanelDeleteTarget | null;
  manageMapsOpen: boolean;
  manageMapsGroups: AssetManagerGroupViewModel[];
  manageMapsItems: AssetManagerItemViewModel[];
  mapOptionsOpen: boolean;
  manageMapsSelectedGroupId: MapGroupId | null;
  newGroupName: string;
  newMapHeight: number;
  newMapName: string;
  newMapType: NewMapType;
  newMapWidth: number;
  onApplyTerrainSelection: (selection: AppliedTerrainSelection) => void;
  onDeleteTerrain: (terrainId: TerrainId) => void;
  onCreateGroup: () => void;
  onCreateMap: () => void;
  onDeleteEmptyGroup: (groupId: MapGroupId) => void;
  onDeleteConfirm: () => void;
  onImportMapFromFile: (file: File) => Promise<boolean>;
  onManageMapsSelectedGroupChange: (groupId: MapGroupId) => void;
  onMoveMapToGroup: (mapId: MapId, targetGroupId: MapGroupId) => void;
  onRenameGroup: (groupId: MapGroupId, name: string) => void;
  onRenameMap: (mapId: MapId, name: string) => void;
  onReorderGroups: (
    dragId: MapGroupId,
    targetId: MapGroupId,
    position: Exclude<AssetManagerGroupDropPosition, "inside">,
  ) => void;
  onReorderMaps: (
    dragId: MapId,
    targetId: MapId,
    position: AssetManagerItemDropPosition,
  ) => void;
  onUpdateMapOptions: (
    width: number,
    height: number,
    properties: Record<string, PropertyValue>,
  ) => void;
  propsObjectId: ObjectId | null;
  setAddGroupOpen: Dispatch<SetStateAction<boolean>>;
  setAddMapOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteTarget: Dispatch<SetStateAction<MapPanelDeleteTarget | null>>;
  setManageMapsOpen: Dispatch<SetStateAction<boolean>>;
  setMapOptionsOpen: Dispatch<SetStateAction<boolean>>;
  setNewGroupName: Dispatch<SetStateAction<string>>;
  setNewMapHeight: Dispatch<SetStateAction<number>>;
  setNewMapName: Dispatch<SetStateAction<string>>;
  setNewMapType: Dispatch<SetStateAction<NewMapType>>;
  setNewMapWidth: Dispatch<SetStateAction<number>>;
  setPropsObjectId: Dispatch<SetStateAction<ObjectId | null>>;
  state: EditorState;
  terrainDialogOpen: boolean;
  terrainDialogTarget: TerrainToolTarget;
  terrainDialogInitialTerrainId: TerrainId | null;
  terrainDialogInitialTiles: TerrainTile[] | null;
  setTerrainDialogOpen: Dispatch<SetStateAction<boolean>>;
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
  setState: ReturnType<
    typeof import("@/store/editor-store").getEditorStore
  >["setState"];
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
  handlePlaceAnimation: MapCanvasProps["onPlaceAnimation"];
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
  setState: ReturnType<
    typeof import("@/store/editor-store").getEditorStore
  >["setState"];
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
