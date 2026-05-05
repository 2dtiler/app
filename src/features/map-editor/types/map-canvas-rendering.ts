import type {
  EditorState,
  ImageLayer,
  MapSelection,
  TileRef,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

export type MapCanvasLayerEntry =
  | { kind: "tile"; layer: TileLayer }
  | { kind: "image"; layer: ImageLayer };

export type DisplayImageLayerResolver = (layer: ImageLayer) => ImageLayer;

export type ImageLayerScaler = (layer: ImageLayer) => ImageLayer;

export interface RenderLayerEntriesParams {
  animationElapsedMs: number;
  canvas: HTMLCanvasElement;
  entries: readonly MapCanvasLayerEntry[];
  getDisplayImageLayer: DisplayImageLayerResolver;
  height: number;
  map: TileMapData;
  scaleImageLayer: ImageLayerScaler;
  scaledTile: number;
  tileAlpha: number;
  tilesets: readonly Tileset[];
  width: number;
  zoom: number;
}

export interface RenderActiveLayerEntryParams {
  animationElapsedMs: number;
  canvas: HTMLCanvasElement;
  entry: MapCanvasLayerEntry | undefined;
  getDisplayImageLayer: DisplayImageLayerResolver;
  map: TileMapData;
  paintBuffer: ReadonlyMap<string, TileRef | null>;
  scaleImageLayer: ImageLayerScaler;
  scaledTile: number;
  tilesets: readonly Tileset[];
  zoom: number;
}

export type TraceCellPath = (
  context: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
) => void;

export interface DrawMapGridParams {
  canvasHeight: number;
  canvasWidth: number;
  mapHeight: number;
  mapWidth: number;
  scaledTile: number;
  traceCellPath: TraceCellPath;
  usesPolygonCells: boolean;
}

export interface DrawResizeDestinationOverlayParams {
  entries: readonly MapCanvasLayerEntry[];
  previewHeight: number;
  previewOffsetXInTiles: number;
  previewOffsetYInTiles: number;
  previewWidth: number;
  scaledTile: number;
  traceCellPath: TraceCellPath;
  usesPolygonCells: boolean;
}

export interface DrawTileSelectionOverlayParams {
  currentTool: EditorState["currentTool"];
  renderedSelection: MapSelection | null;
  scaledTile: number;
  traceCellPath: TraceCellPath;
  usesPolygonCells: boolean;
}
