import type {
  EditorState,
  Project,
  TileSize,
  Tileset,
  TilesetAnimation,
  TilesetGroup,
  TilesetGroupId,
  TilesetId,
} from "@/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  QuickExportControlState,
  QuickExportSurfaceProps,
} from "@/types/quick-export";
import type {
  AssetManagerGroupDropPosition,
  AssetManagerGroupViewModel,
  AssetManagerItemDropPosition,
  AssetManagerItemViewModel,
} from "./asset-manager";
import type {
  PendingTilesetImageImport,
  TilesetImageImportMode,
  TilesetImageImportPosition,
  TilesetPlacementCanvasSize,
} from "./tileset-import";

export interface TilesetPanelProps extends QuickExportSurfaceProps {
  onImportTilesetFromFile: (file: File) => Promise<boolean>;
}

export interface TilesetDeleteTarget {
  type: "tileset" | "group";
  id: string;
  name: string;
}

export interface TilesetToolbarProps {
  project: Project;
  activeTileSize: TileSize;
  activeTileset: Tileset | null;
  animationsVisible: boolean;
  tilesetZoom: number;
  onTileSizeChange: (value: string) => void;
  onZoom: (direction: 1 | -1) => void;
  onOpenAutotile: () => void;
  onAnimationsVisibleChange: (visible: boolean) => void;
}

export interface TilesetDeleteDialogProps {
  deleteTarget: TilesetDeleteTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export interface TilesetPanelTabsProps {
  activeGroup: TilesetGroup | undefined;
  groupTilesets: Tileset[];
  onAddTileset: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onDuplicateTileset: (tileset: Tileset) => void;
  onGroupChange: (value: string) => void;
  onRequestDeleteTarget: (target: TilesetDeleteTarget) => void;
  onSelectTileset: (tilesetId: TilesetId) => void;
  onStartRenamingTab: (tileset: Tileset) => void;
  project: Project;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameValue: string;
  renamingTabId: TilesetId | null;
  setRenameValue: Dispatch<SetStateAction<string>>;
  state: EditorState;
}

export interface ManageTilesetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: AssetManagerGroupViewModel[];
  tilesets: AssetManagerItemViewModel[];
  selectedGroupId: TilesetGroupId | null;
  onSelectedGroupChange: (groupId: TilesetGroupId) => void;
  onCreateGroup: () => void;
  onCreateTileset: (groupId: TilesetGroupId) => void;
  onRenameGroup: (groupId: TilesetGroupId, name: string) => void;
  onDeleteGroup: (groupId: TilesetGroupId) => void;
  onRenameTileset: (tilesetId: TilesetId, name: string) => void;
  onDeleteTileset: (tilesetId: TilesetId) => void;
  onReorderGroups: (
    dragId: TilesetGroupId,
    targetId: TilesetGroupId,
    position: Exclude<AssetManagerGroupDropPosition, "inside">,
  ) => void;
  onMoveTilesetToGroup: (
    tilesetId: TilesetId,
    targetGroupId: TilesetGroupId,
  ) => void;
  onReorderTilesets: (
    dragId: TilesetId,
    targetId: TilesetId,
    position: AssetManagerItemDropPosition,
  ) => void;
}

export interface TilesetPanelDialogsProps {
  activeTileset: Tileset | null;
  addGroupOpen: boolean;
  animationDialogOpen: boolean;
  deleteTarget: TilesetDeleteTarget | null;
  editingAnimation: TilesetAnimation | null;
  manageTilesetGroups: AssetManagerGroupViewModel[];
  manageTilesetItems: AssetManagerItemViewModel[];
  manageTilesetsOpen: boolean;
  manageTilesetsSelectedGroupId: TilesetGroupId | null;
  newGroupName: string;
  onCreateGroup: () => void;
  onCreateTileset: (groupId: TilesetGroupId) => void;
  onDeleteConfirm: () => void;
  onDeleteEmptyGroup: (groupId: TilesetGroupId) => void;
  onRenameGroup: (groupId: TilesetGroupId, name: string) => void;
  onRenameTileset: (tilesetId: TilesetId, name: string) => void;
  onDeleteTileset: (tilesetId: TilesetId) => void;
  onReorderGroups: (
    dragId: TilesetGroupId,
    targetId: TilesetGroupId,
    position: Exclude<AssetManagerGroupDropPosition, "inside">,
  ) => void;
  onMoveTilesetToGroup: (
    tilesetId: TilesetId,
    targetGroupId: TilesetGroupId,
  ) => void;
  onReorderTilesets: (
    dragId: TilesetId,
    targetId: TilesetId,
    position: AssetManagerItemDropPosition,
  ) => void;
  onSaveAnimation: (animation: TilesetAnimation) => void;
  onSaveAutotile: (autotile: NonNullable<Tileset["autotile"]>) => void;
  setAddGroupOpen: Dispatch<SetStateAction<boolean>>;
  setAnimationDialogOpen: Dispatch<SetStateAction<boolean>>;
  setAutotileDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteTarget: Dispatch<SetStateAction<TilesetDeleteTarget | null>>;
  setManageTilesetsOpen: Dispatch<SetStateAction<boolean>>;
  setManageTilesetsSelectedGroupId: Dispatch<
    SetStateAction<TilesetGroupId | null>
  >;
  setNewGroupName: Dispatch<SetStateAction<string>>;
  autotileDialogOpen: boolean;
}

export interface TilesetPanelOverlaysProps {
  activeTileSize: TileSize;
  activeTileset: Tileset | null;
  imageImportError: string | null;
  imageImportMode: TilesetImageImportMode;
  isDropTargetActive: boolean;
  isImageImportBusy: boolean;
  pendingImport: PendingTilesetImageImport | null;
  placementCanvasSize: TilesetPlacementCanvasSize | null;
  placementPosition: TilesetImageImportPosition;
  quickExportControl: QuickExportControlState;
  onAddToExisting: () => void;
  onCancel: () => void;
  onCreateNew: (
    importToCreate?: PendingTilesetImageImport | null,
  ) => Promise<void>;
  onPlace: () => Promise<void>;
  onPositionChange: (position: TilesetImageImportPosition) => void;
}

export interface TilesetFileInputProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => void;
}
