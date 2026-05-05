import type { EncodeGifOptions } from "@/types";

const GIF_MIME_TYPE = "image/gif";
const GIF_MAX_COLORS = 256;
const GIF_MAX_OPAQUE_COLORS = GIF_MAX_COLORS - 1;
const GIF_OPAQUE_FORMAT = "rgb565";
const GIF_TRANSPARENT_FORMAT = "rgba4444";
const GIF_ALPHA_THRESHOLD = 127;
const GIF_TRANSPARENT_INDEX = 0;
const GIF_TRANSPARENT_COLOR = [0, 0, 0, 0] as const;

function hasTransparentPixels(rgba: Uint8Array): boolean {
  for (let index = 3; index < rgba.length; index += 4) {
    if ((rgba[index] ?? 0xff) <= GIF_ALPHA_THRESHOLD) {
      return true;
    }
  }

  return false;
}

function cloneFrameData(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  return new Uint8Array(rgba);
}

function getExpectedFrameLength(width: number, height: number): number {
  return width * height * 4;
}

function createTransparentPalette(palette: number[][]): number[][] {
  return [
    [...GIF_TRANSPARENT_COLOR],
    ...palette.filter((entry) => (entry[3] ?? 0xff) > 0),
  ];
}

export async function encodeGifFrames(
  options: EncodeGifOptions,
): Promise<Blob> {
  const { width, height, frames, repeat, transparency = true } = options;
  if (frames.length === 0) {
    throw new Error("Cannot encode a GIF without frames.");
  }

  const expectedFrameLength = getExpectedFrameLength(width, height);
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const gif = GIFEncoder();

  frames.forEach((frame, frameIndex) => {
    const rgba = cloneFrameData(frame.data);
    if (rgba.length !== expectedFrameLength) {
      throw new Error("GIF frame data does not match the provided dimensions.");
    }

    const useTransparency = transparency && hasTransparentPixels(rgba);
    const palette = useTransparency
      ? createTransparentPalette(
          quantize(rgba, GIF_MAX_OPAQUE_COLORS, {
            format: GIF_TRANSPARENT_FORMAT,
            oneBitAlpha: GIF_ALPHA_THRESHOLD,
          }),
        )
      : quantize(rgba, GIF_MAX_COLORS, {
          format: GIF_OPAQUE_FORMAT,
        });
    const indexed = applyPalette(
      rgba,
      palette,
      useTransparency ? GIF_TRANSPARENT_FORMAT : GIF_OPAQUE_FORMAT,
    );

    gif.writeFrame(indexed, width, height, {
      palette,
      delay: frame.delay ?? 0,
      transparent: useTransparency,
      ...(useTransparency ? { transparentIndex: GIF_TRANSPARENT_INDEX } : {}),
      ...(frameIndex === 0 && repeat !== undefined ? { repeat } : {}),
    });
  });

  gif.finish();

  return new Blob([new Uint8Array(gif.bytes())], {
    type: GIF_MIME_TYPE,
  });
}
