import type { TiledMapImportResult } from "@/features/import-export/types";

export type MappyGraphicDepth = 8 | 15 | 16 | 24 | 32;

export interface MappyChunkDocument {
  id: string;
  data: Uint8Array;
}

export interface MappyHeaderDocument {
  mapVersionHigh: number;
  mapVersionLow: number;
  lsb: boolean;
  mapWidth: number;
  mapHeight: number;
  blockWidth: number;
  blockHeight: number;
  blockDepth: MappyGraphicDepth;
  blockStructureSize: number;
  blockStructureCount: number;
  blockGraphicCount: number;
}

export interface MappyBlockStructureDocument {
  backgroundOffset: number;
  foregroundOffset: number;
  foregroundOffset2: number;
  foregroundOffset3: number;
  userLong1: number;
  userLong2: number;
  userShort1: number;
  userShort2: number;
  userByte1: number;
  userByte2: number;
  userByte3: number;
  flags: number;
}

export interface MappyAuthorDocument {
  name: string;
  info1: string;
  info2: string;
  info3: string;
}

export interface MappyMapDocument {
  header: MappyHeaderDocument;
  author: MappyAuthorDocument | null;
  palette: Uint8Array | null;
  blockStructures: MappyBlockStructureDocument[];
  blockGraphics: Uint8Array;
  layerCells: Int16Array[];
}

export type MappyMapImportResult = TiledMapImportResult;