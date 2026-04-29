import type {
  AutotileNeighborPosition,
  AutotilePatternRelation,
  AutotileTileRegion,
  AutotilePatternSlotId,
  AutotilePresetId,
} from "@/types";

export interface AutotilePatternSlotDefinition {
  id: AutotilePatternSlotId;
  label: string;
  shortLabel: string;
  description: string;
  priority: number;
  neighbors: Record<AutotileNeighborPosition, AutotilePatternRelation>;
}

export interface AutotilePresetDefinition {
  id: AutotilePresetId;
  label: string;
  description: string;
  requiredSlots: AutotilePatternSlotId[];
  optionalSlots: AutotilePatternSlotId[];
}

export interface AutotilePatternDiagramProps {
  definition: AutotilePatternSlotDefinition;
}

export interface AutotilePatternTileCardProps {
  buttonId: string;
  buttonName: string;
  definition: AutotilePatternSlotDefinition;
  isRequired: boolean;
  isSelected: boolean;
  onClear?: () => void;
  tile: AutotileTileRegion | null;
  tileLabel: string;
  onPick: () => void;
}
