import type { DragEvent, ReactNode } from "react";
import type {
  MapObject,
  ObjectId,
  TerrainTile,
  TileSize,
  Tileset,
} from "../map/schema";

export type EditorWorkspaceTab = "layers" | "details";

export interface CompactEditorShellProps {
  tilesetPanel: ReactNode;
  mapPanel: ReactNode;
  workspaceSummary: string;
  workspaceButtonLabel: string;
  workspaceOpen: boolean;
  onOpenWorkspace: () => void;
}

export interface DesktopEditorLayoutProps {
  tilesetPanel: ReactNode;
  mapPanel: ReactNode;
  layersPanel: ReactNode;
  detailsPanel: ReactNode;
  showDetailsPanel: boolean;
}

export interface EditorWorkspaceDrawerProps {
  open: boolean;
  activeTab: EditorWorkspaceTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: EditorWorkspaceTab) => void;
  layersPanel: ReactNode;
  detailsPanel: ReactNode;
  detailsTabLabel: string | null;
  showDetailsPanel: boolean;
}

export interface TerrainTileSelectorProps {
  tiles: TerrainTile[];
  onTilesChange: (tiles: TerrainTile[]) => void;
  tilesets: Tileset[];
  tileSize: TileSize;
}

export interface ObjectRowProps {
  object: MapObject;
  isActive: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelect: (id: ObjectId) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onEditProperties: (id: string) => void;
  isDragging: boolean;
  dropIndicator: "above" | "below" | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, targetId: string) => void;
  onDrop: (e: DragEvent) => void;
}