import type {
  AutotileNeighborPosition,
  AutotilePatternRelation,
  AutotileTileRegion,
  AutotilePatternSlotId,
  AutotilePresetId,
} from "@/types";
import type { ButtonHTMLAttributes } from "react";

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
  editorLayout: "grid" | "cards" | "wang" | "wang-named";
  requiredSlots: AutotilePatternSlotId[];
  optionalSlots: AutotilePatternSlotId[];
}

export interface AutotilePatternCardGroupDefinition {
  id: string;
  title: string;
  description: string;
  slotIds: readonly AutotilePatternSlotId[];
}

export interface AutotilePatternDiagramProps {
  definition: AutotilePatternSlotDefinition;
  centerCell?: ButtonHTMLAttributes<HTMLButtonElement> & {
    emptyLabel?: string;
    image: HTMLImageElement | null;
    isSelected: boolean;
    region: AutotileTileRegion | null;
  };
}

export interface AutotilePatternTileCardProps {
  buttonId: string;
  definition: AutotilePatternSlotDefinition;
  image: HTMLImageElement | null;
  isRequired: boolean;
  isSelected: boolean;
  onClear?: () => void;
  tile: AutotileTileRegion | null;
  onPick: () => void;
}
