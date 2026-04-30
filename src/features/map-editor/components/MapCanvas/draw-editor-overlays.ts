import type { TileLayer } from "@/types";
import type {
  DrawMapGridParams,
  DrawResizeDestinationOverlayParams,
  DrawTileSelectionOverlayParams,
} from "@/features/map-editor/types/map-canvas-rendering";

export function drawMapGrid(
  context: CanvasRenderingContext2D,
  {
    canvasHeight,
    canvasWidth,
    mapHeight,
    mapWidth,
    scaledTile,
    traceCellPath,
    usesPolygonCells,
  }: DrawMapGridParams,
) {
  context.strokeStyle = "rgba(255, 165, 0, 0.15)";
  context.lineWidth = 1;

  if (usesPolygonCells) {
    for (let gridY = 0; gridY < mapHeight; gridY++) {
      for (let gridX = 0; gridX < mapWidth; gridX++) {
        traceCellPath(context, gridX, gridY);
        context.stroke();
      }
    }
    return;
  }

  context.beginPath();
  for (let gridX = 0; gridX <= canvasWidth; gridX += scaledTile) {
    context.moveTo(gridX + 0.5, 0);
    context.lineTo(gridX + 0.5, canvasHeight);
  }
  for (let gridY = 0; gridY <= canvasHeight; gridY += scaledTile) {
    context.moveTo(0, gridY + 0.5);
    context.lineTo(canvasWidth, gridY + 0.5);
  }
  context.stroke();
  context.strokeStyle = "rgba(255, 165, 0, 0.5)";
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvasWidth - 2, canvasHeight - 2);
}

export function drawResizeDestinationOverlay(
  context: CanvasRenderingContext2D,
  {
    entries,
    previewHeight,
    previewOffsetXInTiles,
    previewOffsetYInTiles,
    previewWidth,
    scaledTile,
    traceCellPath,
    usesPolygonCells,
  }: DrawResizeDestinationOverlayParams,
) {
  if (previewOffsetXInTiles === 0 && previewOffsetYInTiles === 0) return;

  const destinationCells = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "tile") continue;

    const layer = entry.layer as TileLayer;
    if (!layer.visible) continue;

    for (const key of Object.keys(layer.tiles)) {
      const [gridX, gridY] = key.split(",").map(Number);
      const destinationX = gridX + previewOffsetXInTiles;
      const destinationY = gridY + previewOffsetYInTiles;
      if (
        destinationX < 0 ||
        destinationY < 0 ||
        destinationX >= previewWidth ||
        destinationY >= previewHeight
      ) {
        continue;
      }
      destinationCells.add(`${destinationX},${destinationY}`);
    }
  }

  context.fillStyle = "rgba(251, 146, 60, 0.14)";
  context.strokeStyle = "rgba(251, 146, 60, 0.85)";
  context.lineWidth = 1.5;

  for (const key of destinationCells) {
    const [tileX, tileY] = key.split(",").map(Number);
    if (usesPolygonCells) {
      traceCellPath(context, tileX, tileY);
      context.fill();
      traceCellPath(context, tileX, tileY);
      context.stroke();
      continue;
    }

    const sourceX = tileX * scaledTile;
    const sourceY = tileY * scaledTile;
    context.fillRect(sourceX, sourceY, scaledTile, scaledTile);
    context.strokeRect(
      sourceX + 0.75,
      sourceY + 0.75,
      scaledTile - 1.5,
      scaledTile - 1.5,
    );
  }
}

export function drawTileSelectionOverlay(
  context: CanvasRenderingContext2D,
  {
    currentTool,
    renderedSelection,
    scaledTile,
    traceCellPath,
    usesPolygonCells,
  }: DrawTileSelectionOverlayParams,
) {
  if (currentTool !== "select" || !renderedSelection) return;

  if (usesPolygonCells) {
    for (let offsetY = 0; offsetY < renderedSelection.height; offsetY++) {
      for (let offsetX = 0; offsetX < renderedSelection.width; offsetX++) {
        const tileX = renderedSelection.x + offsetX;
        const tileY = renderedSelection.y + offsetY;
        traceCellPath(context, tileX, tileY);
        context.fillStyle = "rgba(59, 130, 246, 0.15)";
        context.fill();
        traceCellPath(context, tileX, tileY);
        context.strokeStyle = "rgba(255, 255, 255, 0.8)";
        context.lineWidth = 1;
        context.stroke();
        traceCellPath(context, tileX, tileY);
        context.strokeStyle = "rgba(59, 130, 246, 1)";
        context.lineWidth = 2;
        context.stroke();
      }
    }
    return;
  }

  const sourceX = renderedSelection.x * scaledTile;
  const sourceY = renderedSelection.y * scaledTile;
  const sourceWidth = renderedSelection.width * scaledTile;
  const sourceHeight = renderedSelection.height * scaledTile;
  context.fillStyle = "rgba(59, 130, 246, 0.15)";
  context.fillRect(sourceX, sourceY, sourceWidth, sourceHeight);
  context.strokeStyle = "rgba(255, 255, 255, 0.8)";
  context.lineWidth = 1;
  context.strokeRect(
    sourceX + 0.5,
    sourceY + 0.5,
    sourceWidth - 1,
    sourceHeight - 1,
  );
  context.strokeStyle = "rgba(59, 130, 246, 1)";
  context.strokeRect(
    sourceX + 1.5,
    sourceY + 1.5,
    sourceWidth - 3,
    sourceHeight - 3,
  );
}
