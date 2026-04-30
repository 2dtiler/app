export type AssetType =
  | "tileset"
  | "sprite"
  | "background"
  | "icon"
  | "ui"
  | "vfx";

export interface StyleStack {
  artStyle: string;
  colorPalette: string;
  spriteSize: string;
}

export interface TilesetConfig {
  tileType: string;
  terrain: string;
  transition: string;
  maskMode: string;
  perspective: string;
  seamless: boolean;
}

export interface SpriteConfig {
  role: string;
  animState: string;
  perspective: string;
  direction: string;
  frameCount: string;
  proportion: string;
}

export interface BackgroundConfig {
  layer: string;
  environment: string;
  mood: string;
  seamless: boolean;
}

export interface IconConfig {
  category: string;
  type: string;
  rarity: string;
}

export interface UIConfig {
  elementType: string;
  theme: string;
  nineSlice: boolean;
}

export interface VFXConfig {
  action: string;
  frameCount: string;
  size: string;
}

export interface ModelDef {
  id: string;
  label: string;
  provider: "openai" | "gemini" | "together" | "xai";
  apiModel: string;
  supportsImg2Img: boolean;
  supportedRatios?: Ratio[];
}

export type Ratio = "1:1" | "4:3" | "16:9" | "3:4";

export interface RatioDef {
  value: Ratio;
  label: string;
  w: number;
  h: number;
}

export type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

export interface ImageUploadProps {
  id: string;
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
}
