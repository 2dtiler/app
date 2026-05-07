import type { MappyChunkDocument } from "@/features/import-export/types";
import type { Tileset } from "@/types";

export interface ParsedMappyRoot {
  chunks: MappyChunkDocument[];
}

export interface LoadedMappyTilesetImage {
  image: HTMLImageElement;
  tileset: Tileset;
}