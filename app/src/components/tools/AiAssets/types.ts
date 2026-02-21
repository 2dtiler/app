// Asset taxonomy
export type AssetType =
  | "tileset"
  | "sprite"
  | "background"
  | "icon"
  | "ui"
  | "vfx";

/** Style Stack — shared visual DNA applied to every generated prompt */
export interface StyleStack {
  artStyle: string;
  colorPalette: string;
  spriteSize: string;
}

// Per-asset configuration interfaces
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

// Model definition
export interface ModelDef {
  id: string;
  label: string;
  /** API provider key — must match an id in API_KEY_PROVIDERS */
  provider: "openai" | "gemini" | "together" | "xai";
  /** Model identifier passed directly to the provider's REST API */
  apiModel: string;
  /** Whether this model accepts an input image (img2img / edit) */
  supportsImg2Img: boolean;
  /** Aspect ratios this model supports; undefined = all; empty array = none */
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
