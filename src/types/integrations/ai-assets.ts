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
  provider: AiAssetProviderId;
  apiModel: string;
  supportsImg2Img: boolean;
  supportedRatios?: Ratio[];
}

export type AiAssetProviderId =
  | "huggingface"
  | "openai"
  | "gemini"
  | "together"
  | "xai";

export type Ratio = "1:1" | "4:3" | "16:9" | "3:4";

export interface RatioDef {
  value: Ratio;
  label: string;
  w: number;
  h: number;
}

export interface AiImageDimensions {
  width: number;
  height: number;
}

export interface AiImageGridDimensions {
  columns: number;
  rows: number;
}

export interface AiAssetTargetDimensionInput {
  assetType: AssetType;
  style: StyleStack;
  tileset: TilesetConfig;
  sprite: SpriteConfig;
  vfx: VFXConfig;
}

export interface AiImageDataUrlParts {
  mimeType: string;
  base64: string;
}

export interface AiProviderImageSourceOptions {
  fallbackMimeType?: string;
  targetDimensions?: AiImageDimensions | null;
}

export type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string; recordId?: string }
  | { status: "error"; message: string };

export interface ImageUploadProps {
  id: string;
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
}

export interface AiQuotaState {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  source: "headers" | "unknown";
}

export interface AiGeneratedImageRecord {
  id: string;
  data: ArrayBuffer;
  mimeType: string;
  prompt: string;
  provider: AiAssetProviderId;
  modelId: string;
  modelLabel: string;
  width: number;
  height: number;
  createdAt: number;
  savedAt: number | null;
}

export interface AiGeneratedImageInput {
  data: ArrayBuffer;
  mimeType: string;
  prompt: string;
  provider: AiAssetProviderId;
  modelId: string;
  modelLabel: string;
  width: number;
  height: number;
}

export interface AiProviderImage {
  data: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface AiProviderGenerateRequest {
  apiKey: string;
  model: string;
  prompt: string;
  count: number;
  width: number;
  height: number;
  ratio: Ratio;
  initImageB64: string | null;
  initImageMime: string | null;
}

export interface AiProviderGenerateResult {
  images: AiProviderImage[];
  quota: AiQuotaState;
}

export interface AiSchedulerState {
  intervalSeconds: number;
  running: boolean;
  nextRunAt: number | null;
}
