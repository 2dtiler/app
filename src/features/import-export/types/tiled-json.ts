import type { TiledLayerCompression, TiledLayerEncoding } from "./index";

export interface TiledJsonProperty {
  name?: string;
  type?: string;
  value?: unknown;
}

export interface TiledJsonAnimationFrame {
  tileid?: number;
  duration?: number;
}

export interface TiledJsonTile {
  id?: number;
  animation?: TiledJsonAnimationFrame[];
  properties?: TiledJsonProperty[];
}

export interface TiledJsonPoint {
  x?: number;
  y?: number;
}

export interface TiledJsonText {
  text?: string;
  pixelsize?: number;
  fontfamily?: string;
  wrap?: boolean;
  color?: string;
}

export interface TiledJsonObject {
  id?: number;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  visible?: boolean;
  ellipse?: boolean;
  point?: boolean;
  polygon?: TiledJsonPoint[];
  polyline?: TiledJsonPoint[];
  text?: TiledJsonText;
  gid?: number;
  properties?: TiledJsonProperty[];
}

export interface TiledJsonBaseLayer {
  id?: number;
  name?: string;
  type?: string;
  visible?: boolean;
  opacity?: number;
  offsetx?: number;
  offsety?: number;
  x?: number;
  y?: number;
  properties?: TiledJsonProperty[];
}

export interface TiledJsonTileLayer extends TiledJsonBaseLayer {
  type?: "tilelayer";
  width?: number;
  height?: number;
  data?: number[] | string;
  encoding?: TiledLayerEncoding;
  compression?: TiledLayerCompression;
}

export interface TiledJsonImageLayer extends TiledJsonBaseLayer {
  type?: "imagelayer";
  image?: string;
}

export interface TiledJsonObjectLayer extends TiledJsonBaseLayer {
  type?: "objectgroup";
  objects?: TiledJsonObject[];
}

export interface TiledJsonGroupLayer extends TiledJsonBaseLayer {
  type?: "group";
  layers?: TiledJsonLayer[];
}

export type TiledJsonLayer =
  | TiledJsonTileLayer
  | TiledJsonImageLayer
  | TiledJsonObjectLayer
  | TiledJsonGroupLayer;

export interface TiledJsonTileset {
  type?: string;
  version?: string | number;
  tiledversion?: string | number;
  firstgid?: number;
  source?: string;
  name?: string;
  tilewidth?: number;
  tileheight?: number;
  tilecount?: number;
  columns?: number;
  margin?: number;
  spacing?: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  properties?: TiledJsonProperty[];
  tiles?: TiledJsonTile[];
}

export interface TiledJsonMap {
  type?: string;
  version?: string | number;
  tiledversion?: string | number;
  orientation?: string;
  renderorder?: string;
  width?: number;
  height?: number;
  tilewidth?: number;
  tileheight?: number;
  infinite?: boolean;
  compressionlevel?: number;
  staggeraxis?: string;
  staggerindex?: string;
  hexsidelength?: number;
  nextlayerid?: number;
  nextobjectid?: number;
  properties?: TiledJsonProperty[];
  layers?: TiledJsonLayer[];
  tilesets?: TiledJsonTileset[];
}
