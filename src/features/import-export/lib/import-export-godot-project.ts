import { unzipSync } from "fflate";
import { sanitizeDownloadSegment } from "@/utils/format";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import { exportGodotMapBundle } from "@/features/import-export/lib/import-export-godot";
import { prepareGodotMapImport } from "@/features/import-export/lib/godot-map-import";
import { escapeGodotString } from "@/features/import-export/lib/godot-scene-utils";
import {
  decodeText,
  getDirname,
  joinBundlePath,
  normalizeBundlePath,
} from "@/features/import-export/lib/tiled-xml-utils";
import type {
  GodotImportMissingResource,
  GodotMapImportResult,
  GodotProjectArchivePreparationResult,
  GodotProjectImportPreparationResult,
  GodotProjectImportResult,
  ImportExportArchiveEntry,
  Project,
} from "@/types";

export const GODOT_PROJECT_IMPORT_ACCEPT =
  ".godot,.zip,application/zip,application/x-zip-compressed,text/plain,application/octet-stream";

export const GODOT_PROJECT_FOLDER_ACCEPT =
  ".godot,.tscn,.tres,.res,.png,.jpg,.jpeg,.gif,.bmp,.webp,text/plain,application/octet-stream,image/*";

interface GodotProjectMetadata {
  name: string;
  mainScenePath: string | null;
}

interface ProjectRootEntries {
  entries: ImportExportArchiveEntry[];
  projectEntry: ImportExportArchiveEntry;
}

interface PlannedArchiveEntry {
  originalPath: string;
  finalPath: string;
  data: Uint8Array;
  shouldAdd: boolean;
}

const GODOT_PROJECT_FILE_NAME = "project.godot";
const DEFAULT_IMPORTED_GODOT_PROJECT_NAME = "Imported Godot Project";

function uint8ArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function getBaseName(path: string) {
  return normalizeBundlePath(path).split("/").pop() ?? path;
}

function isGodotProjectEntry(path: string) {
  return getBaseName(path).toLowerCase() === GODOT_PROJECT_FILE_NAME;
}

function isGodotTextResource(path: string) {
  const lowerPath = path.toLowerCase();
  return (
    lowerPath.endsWith(".godot") ||
    lowerPath.endsWith(".tscn") ||
    lowerPath.endsWith(".tres")
  );
}

function normalizeArchiveEntries(
  entries: readonly ImportExportArchiveEntry[],
): ImportExportArchiveEntry[] {
  return entries.map((entry) => ({
    path: normalizeBundlePath(entry.path),
    data: entry.data,
  }));
}

function parseGodotStringValue(rawValue: string | undefined) {
  if (!rawValue) return "";
  const value = rawValue.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function normalizeGodotResourcePath(path: string) {
  if (!path || path.startsWith("uid://")) {
    return null;
  }
  if (path.startsWith("res://")) {
    return normalizeBundlePath(path.slice("res://".length));
  }
  return normalizeBundlePath(path);
}

export function parseGodotProjectMetadata(
  data: Uint8Array,
  fallbackName = DEFAULT_IMPORTED_GODOT_PROJECT_NAME,
): GodotProjectMetadata {
  const text = decodeText(data).replace(/^\uFEFF/, "");
  if (text.includes("\u0000")) {
    throw new Error("Binary Godot project files are not supported.");
  }

  let section = "";
  let projectName = fallbackName;
  let mainScenePath: string | null = null;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim();
      continue;
    }

    if (section !== "application") continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = parseGodotStringValue(line.slice(separatorIndex + 1));

    if (key === "config/name" && value.trim()) {
      projectName = value.trim();
      continue;
    }

    if (key === "run/main_scene") {
      mainScenePath = normalizeGodotResourcePath(value);
    }
  }

  return {
    name: projectName,
    mainScenePath,
  };
}

export function deriveImportedGodotProjectName(fileName: string) {
  const normalizedFileName = fileName.trim();
  const withoutZip = normalizedFileName.replace(/\.zip$/i, "");
  const withoutProjectArchive = withoutZip.replace(/\.godot-project$/i, "");
  const withoutProjectFile = withoutProjectArchive.replace(/\.godot$/i, "");
  const withoutGenericProject = withoutProjectFile.replace(/^project$/i, "");
  return withoutGenericProject || DEFAULT_IMPORTED_GODOT_PROJECT_NAME;
}

export function isGodotProjectFile(fileName: string) {
  return fileName.toLowerCase().endsWith(".godot");
}

function findProjectRootEntries(
  entries: readonly ImportExportArchiveEntry[],
): ProjectRootEntries {
  const normalizedEntries = normalizeArchiveEntries(entries);
  const projectEntry = normalizedEntries.find((entry) =>
    isGodotProjectEntry(entry.path),
  );

  if (!projectEntry) {
    throw new Error("No project.godot file found in the provided files.");
  }

  const projectDir = getDirname(projectEntry.path);
  const entryMap = new Map<string, ImportExportArchiveEntry>();

  for (const entry of normalizedEntries) {
    let rebasedPath = entry.path;
    if (projectDir && entry.path.startsWith(`${projectDir}/`)) {
      rebasedPath = entry.path.slice(projectDir.length + 1);
    }
    if (!rebasedPath) continue;
    entryMap.set(rebasedPath, {
      path: rebasedPath,
      data: entry.data,
    });
  }

  const rebasedProjectEntry = entryMap.get(GODOT_PROJECT_FILE_NAME);
  if (!rebasedProjectEntry) {
    throw new Error("No project.godot file found in the provided files.");
  }

  return {
    entries: [...entryMap.values()],
    projectEntry: rebasedProjectEntry,
  };
}

function isInsideGodotCache(path: string) {
  const lowerPath = path.toLowerCase();
  return lowerPath === ".godot" || lowerPath.startsWith(".godot/");
}

function isMapLikeGodotScene(
  entry: ImportExportArchiveEntry,
  mainScenePath: string | null,
) {
  if (mainScenePath === entry.path) {
    return true;
  }

  const text = decodeText(entry.data);
  if (text.includes("\u0000")) {
    return false;
  }

  return (
    text.includes('metadata/2dtiler_kind = "map"') ||
    /\[node[^\]]*type=("TileMapLayer"|TileMapLayer)/.test(text) ||
    /\[node[^\]]*type=("TileMap"|TileMap)/.test(text)
  );
}

function getCandidateScenePaths(
  entries: readonly ImportExportArchiveEntry[],
  mainScenePath: string | null,
) {
  return entries
    .filter((entry) => {
      if (!entry.path.toLowerCase().endsWith(".tscn")) return false;
      if (isInsideGodotCache(entry.path)) return false;
      return isMapLikeGodotScene(entry, mainScenePath);
    })
    .map((entry) => entry.path)
    .sort((leftPath, rightPath) => {
      if (leftPath === mainScenePath) return -1;
      if (rightPath === mainScenePath) return 1;
      return leftPath.localeCompare(rightPath);
    });
}

function createMissingGodotProjectResource(
  path: string,
): GodotImportMissingResource {
  return {
    path,
    kind: "tscn",
    referringPath: GODOT_PROJECT_FILE_NAME,
    label: "External scene",
  };
}

function mergeMissingResources(
  missingResources: Map<string, GodotImportMissingResource>,
  nextResources: readonly GodotImportMissingResource[],
) {
  for (const resource of nextResources) {
    if (missingResources.has(resource.path)) continue;
    missingResources.set(resource.path, resource);
  }
}

export async function prepareGodotProjectImport(
  entries: readonly ImportExportArchiveEntry[],
): Promise<GodotProjectImportPreparationResult> {
  const { entries: projectEntries, projectEntry } = findProjectRootEntries(entries);
  const metadata = parseGodotProjectMetadata(projectEntry.data);
  const entriesByPath = new Map(
    projectEntries.map((entry) => [entry.path, entry] as const),
  );
  const missingResources = new Map<string, GodotImportMissingResource>();

  if (metadata.mainScenePath && !entriesByPath.has(metadata.mainScenePath)) {
    missingResources.set(
      metadata.mainScenePath,
      createMissingGodotProjectResource(metadata.mainScenePath),
    );
  }

  const scenePaths = getCandidateScenePaths(projectEntries, metadata.mainScenePath);
  if (scenePaths.length === 0 && missingResources.size === 0) {
    throw new Error("No supported Godot map scenes found in the project.");
  }

  if (missingResources.size > 0) {
    return {
      status: "missing-resources",
      missingResources: [...missingResources.values()],
    };
  }

  const maps: GodotMapImportResult[] = [];
  const warnings: GodotProjectImportResult["warnings"] = [];

  for (const scenePath of scenePaths) {
    const attempt = await prepareGodotMapImport(scenePath, projectEntries);
    if (attempt.status === "missing-resources") {
      mergeMissingResources(missingResources, attempt.missingResources);
      continue;
    }

    maps.push(attempt.result);
    warnings.push(
      ...attempt.result.warnings.map((warning) => ({
        ...warning,
        scenePath,
      })),
    );
  }

  if (missingResources.size > 0) {
    return {
      status: "missing-resources",
      missingResources: [...missingResources.values()],
    };
  }

  if (maps.length === 0) {
    throw new Error("No supported Godot map scenes found in the project.");
  }

  return {
    status: "ready",
    result: {
      maps,
      warnings,
    },
  };
}

export async function prepareGodotProjectArchive(
  zipData: Uint8Array,
): Promise<GodotProjectArchivePreparationResult> {
  const extracted = unzipSync(zipData);
  const entries = normalizeArchiveEntries(
    Object.entries(extracted).map(([path, data]) => ({ path, data })),
  );
  const { projectEntry } = findProjectRootEntries(entries);
  const metadata = parseGodotProjectMetadata(projectEntry.data);

  return {
    entries,
    projectName: metadata.name,
    preparation: await prepareGodotProjectImport(entries),
  };
}

export async function importGodotProjectFromZip(
  zipData: Uint8Array,
): Promise<GodotProjectImportResult> {
  const prepared = await prepareGodotProjectArchive(zipData);

  if (prepared.preparation.status === "missing-resources") {
    throw new Error("The Godot project archive is missing linked resources.");
  }

  return prepared.preparation.result;
}

function buildGodotProjectFile(
  project: Project,
  mainScenePath: string | null,
): Uint8Array {
  const lines = [
    "; Engine configuration file.",
    "; Generated by 2D Tiler.",
    "config_version=5",
    "",
    "[application]",
    `config/name=${escapeGodotString(project.name)}`,
    ...(mainScenePath
      ? [`run/main_scene=${escapeGodotString(`res://${mainScenePath}`)}`]
      : []),
    "",
  ];

  return new TextEncoder().encode(lines.join("\n"));
}

function rewriteGodotResourcePaths(
  data: Uint8Array,
  pathRewrites: ReadonlyMap<string, string>,
) {
  if (pathRewrites.size === 0) return data;

  let text = decodeText(data);
  for (const [originalPath, finalPath] of pathRewrites) {
    if (originalPath === finalPath) continue;
    text = text.replaceAll(`res://${originalPath}`, `res://${finalPath}`);
  }

  return new TextEncoder().encode(text);
}

function reserveResourcePath(
  preferredPath: string,
  data: Uint8Array,
  usedPaths: Set<string>,
  binaryDataByPath: Map<string, Uint8Array>,
) {
  if (!isGodotTextResource(preferredPath)) {
    const existingData = binaryDataByPath.get(preferredPath);
    if (existingData && uint8ArraysEqual(existingData, data)) {
      return {
        finalPath: preferredPath,
        shouldAdd: false,
      };
    }
  }

  const finalPath = getUniqueArchivePath(preferredPath, usedPaths);
  if (!isGodotTextResource(finalPath)) {
    binaryDataByPath.set(finalPath, data);
  }

  return {
    finalPath,
    shouldAdd: true,
  };
}

function planMapEntries(
  entries: readonly ImportExportArchiveEntry[],
  scenePath: string,
  usedPaths: Set<string>,
  binaryDataByPath: Map<string, Uint8Array>,
) {
  const sceneEntry = entries.find((entry) =>
    entry.path.toLowerCase().endsWith(".tscn"),
  );
  if (!sceneEntry) {
    throw new Error("Godot map export did not produce a scene file.");
  }

  const pathRewrites = new Map<string, string>();
  const plannedEntries: PlannedArchiveEntry[] = [];

  for (const entry of entries) {
    const originalPath = normalizeBundlePath(entry.path);
    if (entry === sceneEntry) {
      const finalPath = getUniqueArchivePath(scenePath, usedPaths);
      pathRewrites.set(originalPath, finalPath);
      plannedEntries.push({
        originalPath,
        finalPath,
        data: entry.data,
        shouldAdd: true,
      });
      continue;
    }

    const reserved = reserveResourcePath(
      originalPath,
      entry.data,
      usedPaths,
      binaryDataByPath,
    );
    pathRewrites.set(originalPath, reserved.finalPath);
    plannedEntries.push({
      originalPath,
      finalPath: reserved.finalPath,
      data: entry.data,
      shouldAdd: reserved.shouldAdd,
    });
  }

  return {
    scenePath: pathRewrites.get(normalizeBundlePath(sceneEntry.path)) ?? scenePath,
    entries: plannedEntries.map((entry) => ({
      ...entry,
      data: isGodotTextResource(entry.originalPath)
        ? rewriteGodotResourcePaths(entry.data, pathRewrites)
        : entry.data,
    })),
  };
}

export async function exportGodotProjectEntries(
  project: Project,
): Promise<ImportExportArchiveEntry[]> {
  const usedPaths = new Set<string>([GODOT_PROJECT_FILE_NAME]);
  const binaryDataByPath = new Map<string, Uint8Array>();
  const projectEntries: ImportExportArchiveEntry[] = [];
  const scenePaths: string[] = [];
  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  for (const map of project.maps) {
    const groupName = sanitizeDownloadSegment(
      groupNames.get(map.groupId) ?? "Main",
      "Main",
    );
    const sceneFileName = `${sanitizeDownloadSegment(map.name, "map")}.tscn`;
    const preferredScenePath = joinBundlePath(
      "scenes",
      groupName,
      sceneFileName,
    );
    const mapExportData = getMapExportData(project, map);
    const mapEntries = await exportGodotMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      {
        sceneRootName: "",
        tilesetMode: "external",
        textureMode: "copy",
      },
    );
    const planned = planMapEntries(
      mapEntries,
      preferredScenePath,
      usedPaths,
      binaryDataByPath,
    );

    scenePaths.push(planned.scenePath);
    for (const entry of planned.entries) {
      if (!entry.shouldAdd) continue;
      projectEntries.push({
        path: entry.finalPath,
        data: entry.data,
      });
    }
  }

  return [
    {
      path: GODOT_PROJECT_FILE_NAME,
      data: buildGodotProjectFile(project, scenePaths[0] ?? null),
    },
    ...projectEntries,
  ];
}