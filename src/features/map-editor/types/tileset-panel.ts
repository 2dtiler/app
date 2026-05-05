import type { Project, TileSize, Tileset } from "@/types";
import type { QuickExportSurfaceProps } from "@/types/quick-export";

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
