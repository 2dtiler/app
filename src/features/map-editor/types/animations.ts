import type {
  TileRef,
  Tileset,
  TilesetAnimation,
  TilesetAnimationId,
  TilesetId,
} from "@/types";

export interface AnimationPlacementCell {
  dx: number;
  dy: number;
  ref: TileRef;
}

export interface AnimationPlacementStamp {
  tilesetId: TilesetId;
  animationId: TilesetAnimationId;
  widthInTiles: number;
  heightInTiles: number;
  cells: AnimationPlacementCell[];
}

export interface TilesetAnimationDragPayload {
  kind: "tileset-animation";
  tilesetId: TilesetId;
  animationId: TilesetAnimationId;
}

export interface AnimationFrameResolution {
  frameIndex: number;
  elapsedInFrameMs: number;
}

export interface AnimationDefinitionConflict {
  tilesetId: TilesetId;
  animationId: TilesetAnimationId;
  localTileId: number;
}

export interface AnimationStripProps {
  activeAnimationId: TilesetAnimationId | null;
  animations: TilesetAnimation[];
  onAddAnimation: () => void;
  onDeleteAnimation: (animation: TilesetAnimation) => void;
  onEditAnimation: (animation: TilesetAnimation) => void;
  onSelectAnimation: (animation: TilesetAnimation) => void;
  tileset: Tileset;
}

export interface AnimationPreviewCanvasProps {
  animation: TilesetAnimation;
  animated?: boolean;
  cellSize: number;
  className?: string;
  image: HTMLImageElement | null;
  selectedFrameIndex?: number;
}
