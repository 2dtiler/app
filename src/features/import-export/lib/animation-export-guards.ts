import { getTilesetAnimations } from "@/features/map-editor/lib/tileset-animations";
import { getMapExportData } from "@/features/import-export/lib/import-export-action-utils";
import type { Project, TileMapData, Tileset } from "@/types";

function formatAnimationUnsupportedMessage(formatLabel: string) {
  return `${formatLabel} export does not support 2D Tiler animations. Use native or Tiled export for animated tiles.`;
}

export function assertTilesetsHaveNoAnimations(
  tilesets: readonly Tileset[],
  formatLabel: string,
) {
  const hasAnimations = tilesets.some(
    (tileset) => getTilesetAnimations(tileset).length > 0,
  );
  if (hasAnimations) {
    throw new Error(formatAnimationUnsupportedMessage(formatLabel));
  }
}

export function assertMapsHaveNoAnimations(
  project: Project,
  maps: readonly TileMapData[],
  formatLabel: string,
) {
  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];
  const tilesetMap = new Map(
    allTilesets.map((tileset) => [tileset.id, tileset]),
  );

  for (const map of maps) {
    const mapExportData = getMapExportData(project, map);
    for (const layer of mapExportData.layers) {
      for (const ref of Object.values(layer.tiles)) {
        if (ref.animationId) {
          throw new Error(formatAnimationUnsupportedMessage(formatLabel));
        }

        const tileset = tilesetMap.get(ref.tilesetId);
        if (tileset && getTilesetAnimations(tileset).length > 0) {
          throw new Error(formatAnimationUnsupportedMessage(formatLabel));
        }
      }
    }
  }
}
