import Dexie, { type EntityTable } from "dexie";
import type { Project, AppSettings, AssetId } from "@/types";

// ---------------------------------------------------------------------------
// Asset record — stores binary blobs (tileset images) separately
// ---------------------------------------------------------------------------

export interface AssetRecord {
  id: AssetId;
  data: ArrayBuffer;
  mimeType: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Project record — the serializable project metadata (no blobs)
// ---------------------------------------------------------------------------

export interface ProjectRecord {
  id: string;
  name: string;
  data: string; // JSON-stringified Project
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

class TilerDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;
  assets!: EntityTable<AssetRecord, "id">;
  settings!: EntityTable<AppSettings & { id: string }, "id">;

  constructor() {
    super("TilerDB");

    this.version(1).stores({
      projects: "id, name, updatedAt",
      assets: "id, createdAt",
      settings: "id",
      history: "id",
    });
  }
}

export const db = new TilerDatabase();

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

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put({
    id: project.id,
    name: project.name,
    data: JSON.stringify(project),
    updatedAt: Date.now(),
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const record = await db.projects.get(id);
  if (!record) return null;
  return JSON.parse(record.data) as Project;
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
  await db.projects.delete(id);
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
  const { id: _id, ...settings } = record;
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ id: SETTINGS_KEY, ...settings });
}
