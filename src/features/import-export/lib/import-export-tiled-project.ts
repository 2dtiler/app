import { unzipSync } from "fflate";
import { sanitizeDownloadSegment } from "@/utils/format";
import {
  exportTiledMapBundle,
  exportTiledMapJsBundle,
  exportTiledMapJsonBundle,
  exportTiledMapLuaBundle,
} from "@/features/import-export/lib/import-export-tiled";
import { encodeJsonDocument } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import { prepareTiledMapImport } from "@/features/import-export/lib/tiled-map-import";
import type {
  ImportExportArchiveEntry,
  Project,
  TiledBundleExportOptions,
  TiledImportMissingResource,
  TiledMapFormat,
  TiledMapImportResult,
  TiledProjectImportPreparationResult,
  TiledProjectImportResult,
} from "@/types";

const DEFAULT_PROJECT_EXPORT_OPTIONS: TiledBundleExportOptions = {
  encoding: "base64",
  compression: "zlib",
  compressionLevel: 6,
  tilesetMode: "external",
  renderOrder: "right-down",
};

function getMapFileExtension(format: TiledMapFormat): string {
  switch (format) {
    case "json":
      return ".tmj";
    case "js":
      return ".js";
    case "lua":
      return ".lua";
    default:
      return ".tmx";
  }
}

function detectMapFormat(fileName: string): TiledMapFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tmx") || lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".tmj")) return "json";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".lua")) return "lua";
  return null;
}

function isTilesetOrImageEntry(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".tsx") ||
    lower.endsWith(".tsj") ||
    lower.includes("images/") ||
    lower.includes("images\\")
  );
}

type MapBundler = (
  map: Parameters<typeof exportTiledMapBundle>[0],
  layers: Parameters<typeof exportTiledMapBundle>[1],
  tilesets: Parameters<typeof exportTiledMapBundle>[2],
  imageLayers: Parameters<typeof exportTiledMapBundle>[3],
  layerGroups: Parameters<typeof exportTiledMapBundle>[4],
  objectLayers: Parameters<typeof exportTiledMapBundle>[5],
  objects: Parameters<typeof exportTiledMapBundle>[6],
  options: Parameters<typeof exportTiledMapBundle>[7],
) => Promise<ImportExportArchiveEntry[]>;

function getMapBundler(format: TiledMapFormat): MapBundler {
  switch (format) {
    case "json":
      return exportTiledMapJsonBundle;
    case "js":
      return exportTiledMapJsBundle;
    case "lua":
      return exportTiledMapLuaBundle;
    default:
      return exportTiledMapBundle;
  }
}

export async function exportTiledProjectEntries(
  project: Project,
  format: TiledMapFormat = "xml",
  options: TiledBundleExportOptions = DEFAULT_PROJECT_EXPORT_OPTIONS,
): Promise<ImportExportArchiveEntry[]> {
  const exportOptions: TiledBundleExportOptions = {
    ...options,
    tilesetMode: "external",
  };
  const bundler = getMapBundler(format);
  const mapFileExt = getMapFileExtension(format);
  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  const seenPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of project.maps) {
    const mapData = getMapExportData(project, map);
    const entries = await bundler(
      map,
      mapData.layers,
      allTilesets,
      mapData.imageLayers,
      mapData.layerGroups,
      mapData.objectLayers,
      mapData.objects,
      exportOptions,
    );

    const expectedMapPath =
      sanitizeDownloadSegment(map.name, "untitled") + mapFileExt;

    for (const entry of entries) {
      if (entry.path === expectedMapPath) {
        const uniquePath = getUniqueArchivePath(entry.path, seenPaths);
        archiveEntries.push({ path: uniquePath, data: entry.data });
      } else if (!seenPaths.has(entry.path)) {
        seenPaths.add(entry.path);
        archiveEntries.push(entry);
      }
    }
  }

  const projectFileName =
    sanitizeDownloadSegment(project.name, "project") + ".tiled-project";
  archiveEntries.push({
    path: projectFileName,
    data: encodeJsonDocument({
      automappingRulesFile: "",
      commands: [],
      extensionsPath: "extensions",
      folders: ["."],
      propertyTypes: [],
    }),
  });

  return archiveEntries;
}

export async function importTiledProjectFromZip(
  zipData: Uint8Array,
): Promise<TiledProjectImportResult> {
  const extracted = unzipSync(zipData);

  const allEntries: ImportExportArchiveEntry[] = Object.entries(extracted).map(
    ([path, data]) => ({ path, data }),
  );

  const prepared = await prepareTiledProjectImport(allEntries);

  if (prepared.status === "missing-resources") {
    throw new Error("The Tiled project archive is missing linked resources.");
  }

  return prepared.result;
}

export async function prepareTiledProjectImport(
  entries: readonly ImportExportArchiveEntry[],
): Promise<TiledProjectImportPreparationResult> {
  const mapPaths = entries
    .map((entry) => entry.path)
    .filter((path) => {
      if (isTilesetOrImageEntry(path)) return false;
      if (path.toLowerCase().endsWith(".tiled-project")) return false;
      return detectMapFormat(path) !== null;
    });

  if (mapPaths.length === 0) {
    throw new Error("No Tiled map files found in the provided files.");
  }

  const maps: TiledMapImportResult[] = [];
  const missingResources = new Map<string, TiledImportMissingResource>();

  for (const mapPath of mapPaths) {
    const format = detectMapFormat(mapPath)!;
    const result = await prepareTiledMapImport(mapPath, entries, format);

    if (result.status === "missing-resources") {
      mergeMissingResources(missingResources, result.missingResources);
      continue;
    }

    maps.push(result.result);
  }

  if (missingResources.size > 0) {
    return {
      status: "missing-resources",
      missingResources: [...missingResources.values()],
    };
  }

  return {
    status: "ready",
    result: { maps },
  };
}

function mergeMissingResources(
  missingResources: Map<string, TiledImportMissingResource>,
  nextResources: readonly TiledImportMissingResource[],
) {
  for (const resource of nextResources) {
    if (missingResources.has(resource.path)) {
      continue;
    }

    missingResources.set(resource.path, resource);
  }
}
