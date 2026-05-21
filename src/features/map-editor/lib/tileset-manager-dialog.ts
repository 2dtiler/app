import type { Project, TilesetGroupId, TilesetId } from "@/types";
import type {
  AssetManagerGroupViewModel,
  AssetManagerItemViewModel,
} from "@/features/map-editor/types/asset-manager";

export function shouldAutoCreateTilesetImport(
  activeTilesetId: TilesetId | null,
  targetGroupId: TilesetGroupId | null,
) {
  return Boolean(targetGroupId) || !activeTilesetId;
}

export function buildManageTilesetGroups(
  project: Project | null,
): AssetManagerGroupViewModel[] {
  const orderedTilesetGroups = [...(project?.tilesetGroups ?? [])].sort(
    (left, right) => left.order - right.order,
  );

  return orderedTilesetGroups.map((group) => {
    const itemCount =
      project?.tilesets.filter((tileset) => tileset.groupId === group.id)
        .length ?? 0;
    const isLastGroup = orderedTilesetGroups.length <= 1;

    return {
      id: group.id,
      name: group.name,
      itemCount,
      canDelete: !isLastGroup,
      deleteDisabledReason: isLastGroup
        ? "Projects must keep at least one tileset group."
        : undefined,
    };
  });
}

export function buildManageTilesetItems(
  project: Project | null,
  selectedGroupId: TilesetGroupId | null,
): AssetManagerItemViewModel[] {
  return (
    project?.tilesets
      .filter((tileset) => tileset.groupId === selectedGroupId)
      .map((tileset) => ({
        id: tileset.id,
        name: tileset.name,
        subtitle: `${tileset.imageWidth} × ${tileset.imageHeight} px`,
        previewAssetId: tileset.assetId,
      })) ?? []
  );
}
