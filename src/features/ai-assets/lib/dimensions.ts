import type {
  AiAssetTargetDimensionInput,
  AiImageDimensions,
  AiImageGridDimensions,
  RatioDef,
} from "@/types/integrations/ai-assets";

const PIXEL_SIZE_PATTERN = /^(\d+)x(\d+)$/i;

const DEFAULT_TILESET_GRID: AiImageGridDimensions = {
  columns: 4,
  rows: 4,
};

const TILESET_GRIDS: Record<string, AiImageGridDimensions> = {
  "seamless 47-tile blob": { columns: 8, rows: 6 },
  "16-tile corner mask": { columns: 4, rows: 4 },
  "Wang tile": { columns: 4, rows: 4 },
  "dual grid": { columns: 4, rows: 4 },
};

function parsePositiveInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function multiplyDimensions(
  dimensions: AiImageDimensions | null,
  columns: number,
  rows: number,
): AiImageDimensions | null {
  if (!dimensions) return null;
  return {
    width: dimensions.width * columns,
    height: dimensions.height * rows,
  };
}

export function parseAiPixelSize(value: string): AiImageDimensions | null {
  const match = PIXEL_SIZE_PATTERN.exec(value.trim());
  if (!match) return null;

  const width = parsePositiveInteger(match[1] ?? "");
  const height = parsePositiveInteger(match[2] ?? "");
  if (width === null || height === null) return null;

  return { width, height };
}

export function getAiAssetTargetDimensions({
  assetType,
  style,
  tileset,
  sprite,
  vfx,
}: AiAssetTargetDimensionInput): AiImageDimensions | null {
  switch (assetType) {
    case "tileset": {
      const tileSize = parseAiPixelSize(style.spriteSize);
      const grid = TILESET_GRIDS[tileset.maskMode] ?? DEFAULT_TILESET_GRID;
      return multiplyDimensions(tileSize, grid.columns, grid.rows);
    }
    case "sprite": {
      const frameSize = parseAiPixelSize(style.spriteSize);
      const frameCount = parsePositiveInteger(sprite.frameCount);
      return frameCount ? multiplyDimensions(frameSize, frameCount, 1) : null;
    }
    case "icon":
      return parseAiPixelSize(style.spriteSize);
    case "vfx": {
      const frameSize = parseAiPixelSize(vfx.size);
      const frameCount = parsePositiveInteger(vfx.frameCount);
      return frameCount ? multiplyDimensions(frameSize, frameCount, 1) : null;
    }
    case "background":
    case "ui":
      return null;
  }
}

export function getClosestAiAssetRatio(
  dimensions: AiImageDimensions,
  ratios: readonly RatioDef[],
): RatioDef | null {
  if (ratios.length === 0 || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }

  const targetRatio = dimensions.width / dimensions.height;
  return ratios.reduce((closest, ratio) => {
    const closestDistance = Math.abs(
      Math.log(closest.w / closest.h / targetRatio),
    );
    const candidateDistance = Math.abs(
      Math.log(ratio.w / ratio.h / targetRatio),
    );
    return candidateDistance < closestDistance ? ratio : closest;
  });
}
