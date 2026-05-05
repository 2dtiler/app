import {
  getAllGroupIds,
  getAllLayerIds,
} from "@/features/map-editor/lib/layers";
import type {
  DefoldMapExportOptions,
  GameMakerMapExportOptions,
  GodotMapExportOptions,
  ImportExportAssetGroup,
  ImportExportFormatExportOptions,
  ImportExportRasterExportOptions,
  Project,
  TileLayer,
  TileMapData,
  TiledMapExportOptions,
  TiledTilesetExportOptions,
  Tileset,
  TilesetId,
} from "@/types";

export function isRasterExportOptions(
  options?: ImportExportFormatExportOptions,
): options is ImportExportRasterExportOptions {
  return Boolean(options && "fileType" in options);
}

export function isTiledMapExportOptions(
  options?: ImportExportFormatExportOptions,
): options is TiledMapExportOptions {
  return Boolean(options && "tilesetMode" in options && "format" in options);
}

export function isTiledTilesetExportOptions(
  options?: ImportExportFormatExportOptions,
): options is TiledTilesetExportOptions {
  return Boolean(options && "format" in options && !("tilesetMode" in options));
}

export function isGodotMapExportOptions(
  options?: ImportExportFormatExportOptions,
): options is GodotMapExportOptions {
  return Boolean(
    options &&
    "sceneRootName" in options &&
    "tilesetMode" in options &&
    "textureMode" in options,
  );
}

export function isGameMakerMapExportOptions(
  options?: ImportExportFormatExportOptions,
): options is GameMakerMapExportOptions {
  return Boolean(
    options &&
    "format" in options &&
    (options.format === "gmx" || options.format === "yy"),
  );
}

export function isDefoldMapExportOptions(
  options?: ImportExportFormatExportOptions,
): options is DefoldMapExportOptions {
  return Boolean(
    options &&
    "format" in options &&
    (options.format === "tilemap" || options.format === "collection"),
  );
}

type DirectoryEnabledInput = HTMLInputElement & {
  directory?: boolean;
  webkitdirectory?: boolean;
};

interface PickFilesOptions {
  multiple?: boolean;
  configureInput?: (input: HTMLInputElement) => void;
}

async function pickFiles(
  accept: string,
  inputName: string,
  options: PickFilesOptions = {},
): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let attachedInput = false;
    let settled = false;

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);

      if (attachedInput) {
        input.remove();
      }
    };

    const settle = (files: File[] | null) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(files);
    };

    const handleChange = () => {
      settle(input.files ? [...input.files] : null);
    };

    const handleCancel = () => {
      settle(null);
    };

    input.type = "file";
    input.accept = accept;
    input.multiple = Boolean(options.multiple);
    input.name = inputName;
    input.id = `${inputName}-${Math.random().toString(36).slice(2)}`;
    input.hidden = true;
    options.configureInput?.(input);
    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    if (document.body) {
      document.body.appendChild(input);
      attachedInput = true;
    }
    input.click();
  });
}

export async function pickSingleFile(
  accept: string,
  inputName = "import-file",
): Promise<File | null> {
  const files = await pickFiles(accept, inputName);
  return files?.[0] ?? null;
}

export async function pickDirectoryFiles(
  accept = "",
  inputName = "import-directory",
): Promise<File[] | null> {
  return pickFiles(accept, inputName, {
    multiple: true,
    configureInput: (input) => {
      const directoryInput = input as DirectoryEnabledInput;
      directoryInput.directory = true;
      directoryInput.webkitdirectory = true;
    },
  });
}

export function getMapExportData(project: Project, map: TileMapData) {
  const projectLayerGroups = project.layerGroups ?? [];
  const allLayerIds = getAllLayerIds(map.layerOrder, projectLayerGroups);
  const allGroupIds = getAllGroupIds(map.layerOrder, projectLayerGroups);
  const layerIdSet = new Set<string>(allLayerIds as string[]);
  const groupIdSet = new Set<string>(allGroupIds as string[]);

  const objectLayers = (project.objectLayers ?? []).filter((layer) =>
    layerIdSet.has(layer.id as string),
  );
  const objectLayerIdSet = new Set(
    objectLayers.map((layer) => layer.id as string),
  );

  return {
    layers: project.layers.filter((layer) =>
      layerIdSet.has(layer.id as string),
    ),
    imageLayers: (project.imageLayers ?? []).filter((layer) =>
      layerIdSet.has(layer.id as string),
    ),
    layerGroups: projectLayerGroups.filter((group) =>
      groupIdSet.has(group.id as string),
    ),
    objectLayers,
    objects: (project.objects ?? []).filter((object) =>
      objectLayerIdSet.has(object.layerId as string),
    ),
  };
}

function getReferencedThumbnailTilesets(
  projectTilesets: Tileset[],
  layers: TileLayer[],
) {
  const referencedTilesetIds = new Set<TilesetId>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId);
    }
  }

  return projectTilesets
    .filter((tileset) => referencedTilesetIds.has(tileset.id))
    .map((tileset) => ({
      id: tileset.id,
      assetId: tileset.assetId,
    }));
}

export function buildMapExportGroups(
  project: Project,
): ImportExportAssetGroup[] {
  const projectTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  return [...project.mapGroups]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      id: group.id,
      name: group.name,
      assets: project.maps
        .filter((map) => map.groupId === group.id)
        .map((map) => {
          const mapExportData = getMapExportData(project, map);

          return {
            id: map.id,
            name: map.name,
            groupId: group.id,
            groupName: group.name,
            subtitle: `${map.widthInTiles} × ${map.heightInTiles} tiles`,
            thumbnail: {
              kind: "map" as const,
              orientation: map.orientation,
              staggerAxis: map.staggerAxis,
              staggerIndex: map.staggerIndex,
              tileSize: map.tileSize,
              widthInTiles: map.widthInTiles,
              heightInTiles: map.heightInTiles,
              layers: mapExportData.layers.map((layer) => ({
                id: layer.id,
                visible: layer.visible,
                tiles: layer.tiles,
              })),
              tilesets: getReferencedThumbnailTilesets(
                projectTilesets,
                mapExportData.layers,
              ),
            },
          };
        }),
    }))
    .filter((group) => group.assets.length > 0);
}

export function buildTilesetExportGroups(
  project: Project,
): ImportExportAssetGroup[] {
  return [...project.tilesetGroups]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      id: group.id,
      name: group.name,
      assets: project.tilesets
        .filter((tileset) => tileset.groupId === group.id)
        .map((tileset) => ({
          id: tileset.id,
          name: tileset.name,
          groupId: group.id,
          groupName: group.name,
          subtitle: `${tileset.imageWidth} × ${tileset.imageHeight} px`,
          thumbnail: {
            kind: "tileset" as const,
            assetId: tileset.assetId,
            tileSize: tileset.tileSize,
            imageWidth: tileset.imageWidth,
            imageHeight: tileset.imageHeight,
          },
        })),
    }))
    .filter((group) => group.assets.length > 0);
}

export function getUniqueArchivePath(
  path: string,
  usedPaths: Set<string>,
): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const extensionIndex = path.lastIndexOf(".");
  const baseName = extensionIndex >= 0 ? path.slice(0, extensionIndex) : path;
  const extension = extensionIndex >= 0 ? path.slice(extensionIndex) : "";
  let suffix = 2;

  while (usedPaths.has(`${baseName} (${suffix})${extension}`)) {
    suffix += 1;
  }

  const nextPath = `${baseName} (${suffix})${extension}`;
  usedPaths.add(nextPath);
  return nextPath;
}
