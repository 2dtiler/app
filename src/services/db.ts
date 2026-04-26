import Dexie, { type EntityTable } from "dexie";
import type {
  Project,
  AppSettings,
  AssetId,
  QuickExportAssetType,
  QuickExportPreferenceRecord,
  QuickExportSaveTargetRecord,
} from "@/types";
import type { Palette } from "@/features/image-editor/types";
import { normalizeProject } from "@/features/project-management/lib/project";
import type {
  AssetRecord,
  ProjectPrefs,
  ProjectRecord,
} from "@/features/import-export/types";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

class TilerDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;
  assets!: EntityTable<AssetRecord, "id">;
  settings!: EntityTable<AppSettings & { id: string }, "id">;
  quickExportPreferences!: EntityTable<QuickExportPreferenceRecord, "id">;
  quickExportSaveTargets!: EntityTable<QuickExportSaveTargetRecord, "id">;

  constructor() {
    super("TilerDB");

    this.version(1).stores({
      projects: "id, name, updatedAt",
      assets: "id, createdAt",
      settings: "id",
      history: "id",
    });

    this.version(2).stores({
      projects: "id, name, updatedAt",
      assets: "id, createdAt",
      settings: "id",
      history: "id",
      quickExportPreferences: "id, projectId, assetType, assetId, updatedAt",
      quickExportSaveTargets:
        "id, projectId, assetType, assetId, optionId, updatedAt",
    });
  }
}

export const db = new TilerDatabase();

function buildQuickExportPreferenceKey(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
): string {
  return `${projectId}:${assetType}:${assetId}`;
}

function buildQuickExportSaveTargetKey(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
  optionId: string,
): string {
  return `${projectId}:${assetType}:${assetId}:${optionId}`;
}

// ---------------------------------------------------------------------------
// Asset helpers
// ---------------------------------------------------------------------------

export async function saveAsset(
  id: AssetId,
  data: ArrayBuffer,
  mimeType: string,
): Promise<void> {
  await db.assets.put({ id, data, mimeType, createdAt: Date.now() });
}

export async function getAsset(id: AssetId): Promise<AssetRecord | undefined> {
  return db.assets.get(id);
}

export async function deleteAsset(id: AssetId): Promise<void> {
  await db.assets.delete(id);
}

/**
 * Delete multiple assets that are no longer referenced by any project.
 * Accepts AssetIds to remove from the store.
 */
export async function deleteAssets(ids: AssetId[]): Promise<void> {
  if (ids.length === 0) return;
  await db.assets.bulkDelete(ids);
}

/**
 * Clean up orphaned assets: delete any assets in IndexedDB that are not
 * referenced by any tileset in any saved project or the given live project.
 */
export async function cleanOrphanedAssets(
  liveProject?: Project | null,
): Promise<void> {
  const referencedIds = new Set<AssetId>();

  // Gather asset IDs from all saved projects
  const allProjectRecords = await db.projects.toArray();
  for (const record of allProjectRecords) {
    try {
      const project = JSON.parse(record.data) as Project;
      for (const tileset of project.tilesets) {
        referencedIds.add(tileset.assetId);
      }
      for (const imgLayer of project.imageLayers ?? []) {
        referencedIds.add(imgLayer.assetId);
      }
    } catch {
      // Skip corrupt project records
    }
  }

  // Also include asset IDs from the live in-memory project
  if (liveProject) {
    for (const tileset of liveProject.tilesets) {
      referencedIds.add(tileset.assetId);
    }
    for (const imgLayer of liveProject.imageLayers ?? []) {
      referencedIds.add(imgLayer.assetId);
    }
  }

  // Get all stored asset IDs
  const allAssetIds = (await db.assets
    .toCollection()
    .primaryKeys()) as AssetId[];
  const orphaned = allAssetIds.filter((id) => !referencedIds.has(id));

  if (orphaned.length > 0) {
    await db.assets.bulkDelete(orphaned);
  }
}

/**
 * Create an object URL for an asset. Caller is responsible for
 * revoking it via URL.revokeObjectURL when done.
 */
export async function getAssetUrl(id: AssetId): Promise<string | null> {
  const record = await getAsset(id);
  if (!record) return null;
  const blob = new Blob([record.data], { type: record.mimeType });
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

export async function saveProject(
  project: Project,
  { silent = false }: { silent?: boolean } = {},
): Promise<void> {
  if (!silent) window.dispatchEvent(new CustomEvent("project-save-start"));
  try {
    await db.projects.put({
      id: project.id,
      name: project.name,
      data: JSON.stringify(project),
      updatedAt: Date.now(),
    });
  } finally {
    if (!silent) window.dispatchEvent(new CustomEvent("project-save-end"));
  }
}

export async function getProject(id: string): Promise<Project | null> {
  const record = await db.projects.get(id);
  if (!record) return null;
  return normalizeProject(JSON.parse(record.data) as Project);
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function deleteProject(id: string): Promise<void> {
  // Also delete associated assets
  const project = await getProject(id);
  if (project) {
    const assetIds = project.tilesets.map((t) => t.assetId);
    await db.assets.bulkDelete(assetIds);
  }
  await db.quickExportPreferences.where("projectId").equals(id).delete();
  await db.quickExportSaveTargets.where("projectId").equals(id).delete();
  await db.projects.delete(id);
}

export async function saveQuickExportPreference(
  record: Omit<QuickExportPreferenceRecord, "id" | "updatedAt">,
): Promise<void> {
  await db.quickExportPreferences.put({
    ...record,
    id: buildQuickExportPreferenceKey(
      record.projectId,
      record.assetType,
      record.assetId,
    ),
    updatedAt: Date.now(),
  });
}

export async function loadQuickExportPreference(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
): Promise<QuickExportPreferenceRecord | undefined> {
  return db.quickExportPreferences.get(
    buildQuickExportPreferenceKey(projectId, assetType, assetId),
  );
}

export async function deleteQuickExportPreference(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
): Promise<void> {
  await db.quickExportPreferences.delete(
    buildQuickExportPreferenceKey(projectId, assetType, assetId),
  );
}

export async function saveQuickExportSaveTarget(
  record: Omit<QuickExportSaveTargetRecord, "id" | "updatedAt">,
): Promise<void> {
  await db.quickExportSaveTargets.put({
    ...record,
    id: buildQuickExportSaveTargetKey(
      record.projectId,
      record.assetType,
      record.assetId,
      record.optionId,
    ),
    updatedAt: Date.now(),
  });
}

export async function loadQuickExportSaveTarget(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
  optionId: string,
): Promise<QuickExportSaveTargetRecord | undefined> {
  return db.quickExportSaveTargets.get(
    buildQuickExportSaveTargetKey(projectId, assetType, assetId, optionId),
  );
}

export async function deleteQuickExportSaveTarget(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
  optionId: string,
): Promise<void> {
  await db.quickExportSaveTargets.delete(
    buildQuickExportSaveTargetKey(projectId, assetType, assetId, optionId),
  );
}

const PROJECT_PREFS_PREFIX = "project-prefs-";

export function saveProjectPrefs(projectId: string, prefs: ProjectPrefs): void {
  try {
    localStorage.setItem(
      PROJECT_PREFS_PREFIX + projectId,
      JSON.stringify(prefs),
    );
  } catch {
    // Silently fail if localStorage is full or unavailable
  }
}

export function loadProjectPrefs(projectId: string): ProjectPrefs | null {
  try {
    const raw = localStorage.getItem(PROJECT_PREFS_PREFIX + projectId);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectPrefs;
  } catch {
    return null;
  }
}

export function deleteProjectPrefs(projectId: string): void {
  try {
    localStorage.removeItem(PROJECT_PREFS_PREFIX + projectId);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Last opened project (localStorage)
// ---------------------------------------------------------------------------

const LAST_PROJECT_KEY = "last-project-id";

export function saveLastProjectId(projectId: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    // Silently fail
  }
}

export function loadLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "global";

export async function getSettings(): Promise<AppSettings> {
  const record = await db.settings.get(SETTINGS_KEY);
  if (!record) {
    return { autoSaveEnabled: true };
  }
  return { autoSaveEnabled: record.autoSaveEnabled };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ id: SETTINGS_KEY, ...settings });
}

// ---------------------------------------------------------------------------
// Per-project palette library (localStorage)
// ---------------------------------------------------------------------------

const PALETTE_LIBRARY_PREFIX = "palette-library-";

export function savePaletteLibrary(
  projectId: string,
  palettes: Palette[],
): void {
  try {
    localStorage.setItem(
      PALETTE_LIBRARY_PREFIX + projectId,
      JSON.stringify(palettes),
    );
  } catch {
    // Silently fail if localStorage is full or unavailable
  }
}

export function loadPaletteLibrary(projectId: string): Palette[] | null {
  try {
    const raw = localStorage.getItem(PALETTE_LIBRARY_PREFIX + projectId);
    if (!raw) return null;
    return JSON.parse(raw) as Palette[];
  } catch {
    return null;
  }
}

export function deletePaletteLibrary(projectId: string): void {
  try {
    localStorage.removeItem(PALETTE_LIBRARY_PREFIX + projectId);
  } catch {
    // Silently fail
  }
}
