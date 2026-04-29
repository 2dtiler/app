import type {
  AutotilePatternSlotId,
  AutotileTerrain,
  AutotileTileRegion,
} from "@/types";
import type { AutotileSelectionTarget } from "@/features/map-editor/types/dialogs";

export type AutotileAssignmentGroupId = "edges-outside" | "inside-corners";

export interface AutotileAssignmentCellDefinition {
  slotId: AutotilePatternSlotId;
  row: number;
  column: number;
}

export interface AutotileAssignmentGroupDefinition {
  id: AutotileAssignmentGroupId;
  title: string;
  description: string;
  cells: readonly AutotileAssignmentCellDefinition[];
}

export interface AutotileTilePreviewProps {
  image: HTMLImageElement | null;
  region: AutotileTileRegion | null;
  size?: number;
  className?: string;
  emptyLabel?: string;
}

export interface AutotilePatternGroupCardProps {
  group: AutotileAssignmentGroupDefinition;
  terrain: AutotileTerrain;
  tilesetImage: HTMLImageElement | null;
  activeSlotIds: readonly AutotilePatternSlotId[];
  selectionTarget: AutotileSelectionTarget | null;
  paintTile: AutotileTileRegion | null;
  onSelectSlot: (slotId: AutotilePatternSlotId) => void;
  onClearSlot: (slotId: AutotilePatternSlotId) => void;
  onSelectPaintTile: () => void;
  onClearPaintTile: () => void;
}

export interface AutotileTerrainSidebarProps {
  terrains: AutotileTerrain[];
  activeTerrainId: AutotileTerrain["id"] | null;
  configuredSlotIds: readonly AutotilePatternSlotId[];
  onCreateRule: () => void;
  onDeleteRule: (terrainId: AutotileTerrain["id"]) => void;
  onSelectRule: (terrainId: AutotileTerrain["id"]) => void;
}
