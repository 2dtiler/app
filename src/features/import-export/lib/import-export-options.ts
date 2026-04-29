import type {
  ImportExportAssetType,
  ImportExportDialogMode,
  ImportExportOptionDefinition,
  ImportExportOptionId,
} from "@/features/import-export/types";

export const IMPORT_EXPORT_OPTION_DEFINITIONS: ImportExportOptionDefinition[] =
  [
    {
      id: "project-native",
      assetType: "project",
      label: "2D Tiler Project (.2dp)",
      description: "Import or export Native 2D Tiler project files.",
      supportedNow: true,
    },
    {
      id: "project-tiled",
      assetType: "project",
      label: "Tiled Project (.tiled-project)",
      description: "Tiled multi-map project container.",
      supportedNow: false,
    },
    {
      id: "map-native",
      assetType: "map",
      label: "2D Tiler Map (.2dm)",
      description: "Import or export Native 2D Tiler map files.",
      supportedNow: true,
    },
    {
      id: "map-image",
      assetType: "map",
      label: "Image: PNG/JPG/WebP/BMP/GIF",
      description: "Raster image export and import targets.",
      supportedNow: true,
    },
    {
      id: "map-phaser",
      assetType: "map",
      label: "Phaser.js Map Bundle (.json)",
      description:
        "Imports and exports Phaser-ready Tiled JSON map bundles with inline tileset data and linked tileset images.",
      supportedNow: true,
    },
    {
      id: "map-tiled",
      assetType: "map",
      label: "Tiled Map Export",
      description:
        "Exports Tiled XML, JSON, JavaScript, Lua, or CSV map files from a single settings panel.",
      supportedNow: true,
      supportedModes: ["export"],
    },
    {
      id: "map-tiled-file",
      assetType: "map",
      label: "Tiled Map File (.tmx, .xml, .tmj, .json, .js, .lua)",
      description:
        "Imports Tiled TMX, XML, JSON, JavaScript, or Lua maps and prompts for linked resources when needed.",
      supportedNow: true,
      supportedModes: ["import"],
    },
    {
      id: "map-godot",
      assetType: "map",
      label: "Godot 4 Scene File (.tscn)",
      description: "Import or export Godot 4 scene files for maps.",
      supportedNow: true,
    },
    {
      id: "map-unity",
      assetType: "map",
      label: "Unity Tilemap Bundle (.prefab)",
      description:
        "Imports and exports Unity Tilemap prefab bundles, including 2D Tiler exports with linked manifests, Tile assets, and .meta resources.",
      supportedNow: true,
    },
    {
      id: "map-gamemaker",
      assetType: "map",
      label: "GameMaker Room (.room.gmx, .yy)",
      description:
        "Imports GameMaker room files and exports either legacy GMX or GameMaker Studio 2 YY rooms from one settings panel.",
      supportedNow: true,
    },
    {
      id: "map-defold",
      assetType: "map",
      label: "Defold Tilemap / Collection (.tilemap, .collection)",
      description:
        "Imports Defold tilemap and collection resources and exports either format from one Defold settings panel.",
      supportedNow: true,
    },
    {
      id: "map-tide",
      assetType: "map",
      label: "tIDE Maps (.tide)",
      description:
        "Imports tIDE XML maps and exports bundled tIDE map archives with linked tileset images.",
      supportedNow: true,
    },
    {
      id: "map-mappy-fmp",
      assetType: "map",
      label: "Mappy FMP (.fmp)",
      description:
        "Imports and exports standalone Mappy FMP 1.0 tile maps with up to 8 orthogonal tile layers.",
      supportedNow: true,
    },
    {
      id: "tileset-native",
      assetType: "tileset",
      label: "2D Tiler Tileset (.2dt)",
      description: "Import or export native 2D Tiler tileset files.",
      supportedNow: true,
    },
    {
      id: "tileset-image",
      assetType: "tileset",
      label: "Image: PNG/JPG/WebP/BMP/GIF",
      description: "Raster image tileset target.",
      supportedNow: true,
    },
    {
      id: "tileset-tiled",
      assetType: "tileset",
      label: "Tiled Tileset Export",
      description: "Exports Tiled XML, JSON, or Lua tileset bundles.",
      supportedNow: true,
      supportedModes: ["export"],
    },
    {
      id: "tileset-tiled-file",
      assetType: "tileset",
      label: "Tiled Tileset File (.tsx, .xml, .tsj, .json, .lua)",
      description:
        "Imports Tiled XML, JSON, or Lua tilesets and prompts for linked resources when needed.",
      supportedNow: true,
      supportedModes: ["import"],
    },
    {
      id: "tileset-defold",
      assetType: "tileset",
      label: "Defold Tile Source (.tilesource)",
      description:
        "Imports and exports Defold tile source resources with linked source images.",
      supportedNow: true,
    },
    {
      id: "tileset-godot",
      assetType: "tileset",
      label: "Godot 4 Tileset Bundle (.tres)",
      description: "Exports Godot 4 tileset resources for selected tilesets.",
      supportedNow: true,
      supportedModes: ["export"],
    },
    {
      id: "tileset-unity",
      assetType: "tileset",
      label: "Unity Sprite Sheet Bundle (.png + .meta)",
      description:
        "Imports and exports Unity sprite-sheet bundles using a texture image plus a Unity .meta sidecar with tile-size metadata.",
      supportedNow: true,
    },
  ];

export const IMPORT_EXPORT_ASSET_TABS: ImportExportAssetType[] = [
  "project",
  "map",
  "tileset",
];

export function isRasterImageOption(optionId: ImportExportOptionId) {
  return optionId === "map-image" || optionId === "tileset-image";
}

export function isTiledMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-tiled";
}

export function isTiledTilesetOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-tiled";
}

export function isGodotMapExportOption(optionId: ImportExportOptionId) {
  return optionId === "map-godot";
}

export function isGameMakerMapExportOption(optionId: ImportExportOptionId) {
  return optionId === "map-gamemaker";
}

export function isDefoldMapExportOption(optionId: ImportExportOptionId) {
  return optionId === "map-defold";
}

export function isExpandableExportOption(optionId: ImportExportOptionId) {
  return (
    isRasterImageOption(optionId) ||
    isTiledMapOption(optionId) ||
    isTiledTilesetOption(optionId) ||
    isGodotMapExportOption(optionId) ||
    isGameMakerMapExportOption(optionId) ||
    isDefoldMapExportOption(optionId)
  );
}

export function isOptionSupportedInMode(
  option: ImportExportOptionDefinition,
  mode: ImportExportDialogMode,
) {
  return option.supportedModes
    ? option.supportedModes.includes(mode)
    : option.supportedNow;
}

export function getImportExportOptionDefinition(
  optionId: ImportExportOptionId,
): ImportExportOptionDefinition | undefined {
  return IMPORT_EXPORT_OPTION_DEFINITIONS.find(
    (option) => option.id === optionId,
  );
}

export function getExportOptionDefinitions(
  assetType: Extract<ImportExportAssetType, "map" | "tileset">,
) {
  return IMPORT_EXPORT_OPTION_DEFINITIONS.filter(
    (option) =>
      option.assetType === assetType &&
      option.supportedNow &&
      (!option.supportedModes || option.supportedModes.includes("export")),
  );
}
