declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        repeat?: number;
        colorDepth?: number;
        dispose?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  };

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: {
      format?: string;
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaColor?: number;
      clearAlphaThreshold?: number;
      useSqrt?: boolean;
    },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array;

  export function nearestColorIndex(
    palette: number[][],
    pixel: number[],
  ): number;

  export function nearestColor(palette: number[][], pixel: number[]): number[];

  export function snapColorsToPalette(
    palette: number[][],
    knownColors: number[][],
    threshold?: number,
  ): void;

  export function prequantize(
    rgba: Uint8Array,
    opts?: {
      roundRGB?: number;
      roundAlpha?: number;
      oneBitAlpha?: boolean | number;
    },
  ): Uint8Array;
}
