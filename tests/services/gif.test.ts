import { afterEach, expect, test, vi } from "vitest";
import { encodeGifFrames } from "@/services/gif";

const gifMocks = vi.hoisted(() => {
  const writeFrame = vi.fn();
  const finish = vi.fn();
  const bytes = vi.fn(() => new Uint8Array([71, 73, 70]));

  return {
    writeFrame,
    finish,
    bytes,
    GIFEncoder: vi.fn(() => ({
      writeFrame,
      finish,
      bytes,
    })),
    quantize: vi.fn(),
    applyPalette: vi.fn(),
  };
});

vi.mock("gifenc", () => ({
  GIFEncoder: gifMocks.GIFEncoder,
  quantize: gifMocks.quantize,
  applyPalette: gifMocks.applyPalette,
}));

afterEach(() => {
  gifMocks.GIFEncoder.mockClear();
  gifMocks.quantize.mockReset();
  gifMocks.applyPalette.mockReset();
  gifMocks.writeFrame.mockReset();
  gifMocks.finish.mockReset();
  gifMocks.bytes.mockReset();
  gifMocks.bytes.mockReturnValue(new Uint8Array([71, 73, 70]));
});

test("encodeGifFrames reserves palette index 0 for transparent pixels", async () => {
  gifMocks.quantize.mockReturnValue([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 0, 0],
  ]);
  gifMocks.applyPalette.mockImplementation((_rgba, palette, format) => {
    expect(format).toBe("rgba4444");
    expect(palette).toEqual([
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ]);

    return new Uint8Array([1, 2, 0, 0]);
  });

  const blob = await encodeGifFrames({
    width: 2,
    height: 2,
    transparency: true,
    frames: [
      {
        delay: 120,
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      },
    ],
  });

  expect(blob.type).toBe("image/gif");
  expect(gifMocks.quantize).toHaveBeenCalledWith(expect.any(Uint8Array), 255, {
    format: "rgba4444",
    oneBitAlpha: 127,
  });
  expect(gifMocks.writeFrame).toHaveBeenCalledWith(
    new Uint8Array([1, 2, 0, 0]),
    2,
    2,
    {
      delay: 120,
      palette: [
        [0, 0, 0, 0],
        [255, 0, 0, 255],
        [0, 255, 0, 255],
      ],
      transparent: true,
      transparentIndex: 0,
    },
  );
  expect(gifMocks.finish).toHaveBeenCalledTimes(1);
});

test("encodeGifFrames keeps opaque exports on an opaque palette", async () => {
  gifMocks.quantize.mockReturnValue([
    [255, 0, 0],
    [0, 255, 0],
  ]);
  gifMocks.applyPalette.mockImplementation((_rgba, palette, format) => {
    expect(format).toBe("rgb565");
    expect(palette).toEqual([
      [255, 0, 0],
      [0, 255, 0],
    ]);

    return new Uint8Array([0, 1, 0, 1]);
  });

  await encodeGifFrames({
    width: 2,
    height: 2,
    transparency: false,
    frames: [
      {
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255,
        ]),
      },
    ],
  });

  expect(gifMocks.quantize).toHaveBeenCalledWith(expect.any(Uint8Array), 256, {
    format: "rgb565",
  });
  expect(gifMocks.writeFrame).toHaveBeenCalledWith(
    new Uint8Array([0, 1, 0, 1]),
    2,
    2,
    {
      delay: 0,
      palette: [
        [255, 0, 0],
        [0, 255, 0],
      ],
      transparent: false,
    },
  );
});
