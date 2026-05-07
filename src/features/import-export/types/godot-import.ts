import type {
  AssetId,
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
  TileSize,
  Tileset,
} from "@/types";

export interface GodotSection {
  kind: string;
  attrs: Record<string, string>;
  properties: Record<string, string>;
}

export interface GodotExtResource {
  id: string;
  type: string;
  path: string;
  resolvedPath: string;
}

export interface GodotNode {
  name: string;
  type: string;
  parent: string | null;
  path: string;
  properties: Record<string, string>;
}

export interface GodotDocument {
  kind: "scene" | "resource";
  path: string;
  extResources: ReadonlyMap<string, GodotExtResource>;
  subResources: ReadonlyMap<string, GodotSection>;
  nodes: readonly GodotNode[];
  resourceSection: GodotSection | null;
}

export interface ImportedImageAsset {
  assetId: AssetId;
  width: number;
  height: number;
}

export interface ResolvedTilesetSource {
  sourceId: number;
  texturePath: string;
  tileSize: TileSize;
  tileset: Tileset;
}

export interface ResolvedTilesetResource {
  key: string;
  tileSize: TileSize;
  orientation: MapOrientation;
  staggerAxis?: MapStaggerAxis;
  staggerIndex?: MapStaggerIndex;
  sources: ReadonlyMap<number, ResolvedTilesetSource>;
}

export interface GodotImportContext {
  providedEntries: ReadonlyMap<string, Uint8Array>;
  documentCache: Map<string, GodotDocument>;
  imageCache: Map<string, Promise<ImportedImageAsset>>;
  tilesetCache: Map<string, Promise<ResolvedTilesetResource>>;
}

export interface GodotResourceReference {
  kind: "ExtResource" | "SubResource";
  id: string;
}

export interface GodotVector2 {
  x: number;
  y: number;
}
