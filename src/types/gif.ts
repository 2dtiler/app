export interface GifFrameInput {
  data: Uint8Array | Uint8ClampedArray;
  delay?: number;
}

export interface EncodeGifOptions {
  width: number;
  height: number;
  frames: readonly GifFrameInput[];
  repeat?: number;
  transparency?: boolean;
}
