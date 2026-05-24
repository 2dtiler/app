import { assert, test } from "vitest";
import { ALL_RATIOS } from "@/features/ai-assets/lib/constants";
import {
  getAiAssetTargetDimensions,
  getClosestAiAssetRatio,
  parseAiPixelSize,
} from "@/features/ai-assets/lib/dimensions";
import type { AiAssetTargetDimensionInput } from "@/types/integrations/ai-assets";

const baseInput: AiAssetTargetDimensionInput = {
  assetType: "tileset",
  style: {
    artStyle: "pixel art",
    colorPalette: "vibrant",
    spriteSize: "32x32",
  },
  tileset: {
    tileType: "Ground",
    terrain: "Grass",
    transition: "None",
    maskMode: "seamless 47-tile blob",
    perspective: "Top-down",
    seamless: true,
  },
  sprite: {
    role: "Hero / Player",
    animState: "idle",
    perspective: "side-view",
    direction: "South",
    frameCount: "4",
    proportion: "semi-realistic",
  },
  vfx: {
    action: "Explosion",
    frameCount: "8",
    size: "64x64",
  },
};

test("parses pixel size strings", () => {
  assert.deepEqual(parseAiPixelSize("32x48"), { width: 32, height: 48 });
  assert.strictEqual(parseAiPixelSize("0x48"), null);
  assert.strictEqual(parseAiPixelSize("large"), null);
});

test("calculates structured AI asset target dimensions", () => {
  assert.deepEqual(getAiAssetTargetDimensions(baseInput), {
    width: 256,
    height: 192,
  });
  assert.deepEqual(
    getAiAssetTargetDimensions({ ...baseInput, assetType: "sprite" }),
    { width: 128, height: 32 },
  );
  assert.deepEqual(
    getAiAssetTargetDimensions({ ...baseInput, assetType: "icon" }),
    { width: 32, height: 32 },
  );
  assert.deepEqual(
    getAiAssetTargetDimensions({ ...baseInput, assetType: "vfx" }),
    { width: 512, height: 64 },
  );
});

test("preserves ratio-based behavior for assets without explicit pixel targets", () => {
  assert.strictEqual(
    getAiAssetTargetDimensions({ ...baseInput, assetType: "background" }),
    null,
  );
  assert.strictEqual(
    getAiAssetTargetDimensions({ ...baseInput, assetType: "ui" }),
    null,
  );
});

test("finds the closest supported provider aspect ratio", () => {
  assert.strictEqual(
    getClosestAiAssetRatio({ width: 128, height: 32 }, ALL_RATIOS)?.value,
    "16:9",
  );
  assert.strictEqual(
    getClosestAiAssetRatio({ width: 256, height: 192 }, ALL_RATIOS)?.value,
    "4:3",
  );
});