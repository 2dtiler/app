import type {
  AutotileConfig,
  AutotilePatternSlotId,
  AutotilePresetId,
  AutotileTerrain,
  AutotileTileRegion,
  AutotileWangPosition,
  AutotileWangSet,
  AutotileWangSetType,
} from "@/types";
import type { AutotilePatternSlotDefinition } from "@/features/map-editor/types/autotile-builder";
import type { AutotileSelectionTarget } from "@/features/map-editor/types/dialogs";
import type { Dispatch, SetStateAction } from "react";

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
  ariaLabel?: string;
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

export interface AutotileWangPatternDiagramProps {
  definition: AutotilePatternSlotDefinition;
  className?: string;
}

export interface AutotileWangPatternEditorProps {
  terrain: AutotileTerrain;
  tilesetImage: HTMLImageElement | null;
  patternDefinitions: readonly AutotilePatternSlotDefinition[];
  requiredSlotIds: readonly AutotilePatternSlotId[];
  selectionTarget: AutotileSelectionTarget | null;
  onSelectSlot: (slotId: AutotilePatternSlotId) => void;
  onClearSlot: (slotId: AutotilePatternSlotId) => void;
  onSelectPaintTile: () => void;
  onClearPaintTile: () => void;
}

export interface AutotileNamedWangEditorProps {
  wangSets: readonly AutotileWangSet[];
  activeWangSetId: AutotileWangSet["id"] | null;
  tilesetImage: HTMLImageElement | null;
  selectionTarget: AutotileSelectionTarget | null;
  onAddSet: () => void;
  onDeleteSet: (wangSetId: AutotileWangSet["id"]) => void;
  onSelectSet: (wangSetId: AutotileWangSet["id"]) => void;
  onUpdateSetName: (wangSetId: AutotileWangSet["id"], name: string) => void;
  onUpdateSetType: (
    wangSetId: AutotileWangSet["id"],
    type: AutotileWangSetType,
  ) => void;
  onSelectSetTile: (wangSetId: AutotileWangSet["id"]) => void;
  onClearSetTile: (wangSetId: AutotileWangSet["id"]) => void;
  onAddColor: (wangSetId: AutotileWangSet["id"]) => void;
  onDeleteColor: (wangSetId: AutotileWangSet["id"], colorIndex: number) => void;
  onUpdateColorName: (
    wangSetId: AutotileWangSet["id"],
    colorIndex: number,
    name: string,
  ) => void;
  onUpdateColorValue: (
    wangSetId: AutotileWangSet["id"],
    colorIndex: number,
    color: string,
  ) => void;
  onUpdateColorProbability: (
    wangSetId: AutotileWangSet["id"],
    colorIndex: number,
    probability: number,
  ) => void;
  onSelectColorTile: (
    wangSetId: AutotileWangSet["id"],
    colorIndex: number,
  ) => void;
  onClearColorTile: (
    wangSetId: AutotileWangSet["id"],
    colorIndex: number,
  ) => void;
  onAddTile: (wangSetId: AutotileWangSet["id"]) => void;
  onDeleteTile: (wangSetId: AutotileWangSet["id"], tileIndex: number) => void;
  onSelectTile: (wangSetId: AutotileWangSet["id"], tileIndex: number) => void;
  onClearTile: (wangSetId: AutotileWangSet["id"], tileIndex: number) => void;
  onUpdateTileProbability: (
    wangSetId: AutotileWangSet["id"],
    tileIndex: number,
    probability: number,
  ) => void;
  onUpdateTileWangColor: (
    wangSetId: AutotileWangSet["id"],
    tileIndex: number,
    position: AutotileWangPosition,
    colorIndex: number,
  ) => void;
}

export interface AutotileNamedWangSetDetailsProps {
  wangSet: AutotileWangSet;
  tilesetImage: HTMLImageElement | null;
  selectionTarget: AutotileSelectionTarget | null;
  onUpdateSetName: AutotileNamedWangEditorProps["onUpdateSetName"];
  onUpdateSetType: AutotileNamedWangEditorProps["onUpdateSetType"];
  onSelectSetTile: AutotileNamedWangEditorProps["onSelectSetTile"];
  onClearSetTile: AutotileNamedWangEditorProps["onClearSetTile"];
}

export interface AutotileNamedWangColorListProps {
  wangSet: AutotileWangSet;
  tilesetImage: HTMLImageElement | null;
  selectionTarget: AutotileSelectionTarget | null;
  onAddColor: AutotileNamedWangEditorProps["onAddColor"];
  onDeleteColor: AutotileNamedWangEditorProps["onDeleteColor"];
  onUpdateColorName: AutotileNamedWangEditorProps["onUpdateColorName"];
  onUpdateColorValue: AutotileNamedWangEditorProps["onUpdateColorValue"];
  onUpdateColorProbability: AutotileNamedWangEditorProps["onUpdateColorProbability"];
  onSelectColorTile: AutotileNamedWangEditorProps["onSelectColorTile"];
  onClearColorTile: AutotileNamedWangEditorProps["onClearColorTile"];
}

export interface AutotileNamedWangTileAssignmentsProps {
  wangSet: AutotileWangSet;
  tilesetImage: HTMLImageElement | null;
  selectionTarget: AutotileSelectionTarget | null;
  onAddTile: AutotileNamedWangEditorProps["onAddTile"];
  onDeleteTile: AutotileNamedWangEditorProps["onDeleteTile"];
  onSelectTile: AutotileNamedWangEditorProps["onSelectTile"];
  onClearTile: AutotileNamedWangEditorProps["onClearTile"];
  onUpdateTileProbability: AutotileNamedWangEditorProps["onUpdateTileProbability"];
  onUpdateTileWangColor: AutotileNamedWangEditorProps["onUpdateTileWangColor"];
}

export interface UseAutotileNamedWangEditorOptions {
  draft: AutotileConfig;
  fallbackPreset: AutotilePresetId;
  setDraft: Dispatch<SetStateAction<AutotileConfig>>;
  onSelectTarget: (target: AutotileSelectionTarget) => void;
  onClearSelectionTarget: () => void;
}
