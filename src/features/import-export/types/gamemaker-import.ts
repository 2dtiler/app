export interface LegacyTilesetDescriptor {
  name: string;
  imagePath: string;
  tileSize: number;
}

export interface LegacyBackgroundDescriptor {
  name: string;
  imagePath: string;
}

export interface ModernTilesetDescriptor {
  path: string;
  name: string;
  imagePath: string;
  tileSize: number;
  tileXOffset: number;
  tileYOffset: number;
  tileSeparation: number;
  outColumns: number;
}

export interface ParsedModernTileCell {
  x: number;
  y: number;
  value: number;
}

export interface ParsedModernTileData {
  width: number;
  height: number;
  cells: ParsedModernTileCell[];
}

export interface GameMakerImportedImageRecord {
  assetId: AssetId;
  mimeType: string;
  width: number;
  height: number;
}
import type { AssetId } from "@/types";
