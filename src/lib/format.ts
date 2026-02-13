/**
 * Binary Formats — Import/Export
 *
 * .2dp — Full project (project metadata + all assets)
 * .2dm — Single map (map + layers + referenced tileset assets)
 * .2dt — Single tileset (tileset metadata + image asset)
 *
 * Format structure (shared):
 *   1. MsgPack-encoded payload object
 *   2. Compressed with fflate (zlib deflate, level 6)
 *
 * Asset blobs are concatenated and referenced by byte offsets in a manifest.
 */

import { encode, decode } from "@msgpack/msgpack";
import { zlibSync, unzlibSync } from "fflate";
import type {
  Project,
  AssetId,
  TileMapData,
  TileLayer,
  Tileset,
  TilesetId,
} from "@/types";
import { getAsset, saveAsset } from "./db";

interface AssetManifestEntry {
  id: AssetId;
  mimeType: string;
  byteLength: number;
}

interface PackedProject {
  project: Project;
  manifest: AssetManifestEntry[];
  /** Concatenated raw asset bytes */
  assetBlob: Uint8Array;
}

interface PackedMap {
  map: TileMapData;
  layers: TileLayer[];
  /** Tileset metadata for every tileset referenced by tiles on these layers */
  tilesets: Tileset[];
  manifest: AssetManifestEntry[];
  assetBlob: Uint8Array;
}

interface PackedTileset {
  tileset: Tileset;
  manifest: AssetManifestEntry[];
  assetBlob: Uint8Array;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function packAssets(
  assetIds: AssetId[],
): Promise<{ manifest: AssetManifestEntry[]; assetBlob: Uint8Array }> {
  const manifest: AssetManifestEntry[] = [];
  const assetChunks: Uint8Array[] = [];

  for (const assetId of assetIds) {
    const record = await getAsset(assetId);
    if (!record) continue;
    const bytes = new Uint8Array(record.data);
    manifest.push({
      id: assetId,
      mimeType: record.mimeType,
      byteLength: bytes.byteLength,
    });
    assetChunks.push(bytes);
  }

  const totalBytes = assetChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const assetBlob = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of assetChunks) {
    assetBlob.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { manifest, assetBlob };
}

async function unpackAssets(
  manifest: AssetManifestEntry[],
  assetBlob: Uint8Array,
): Promise<void> {
  let offset = 0;
  for (const entry of manifest) {
    const bytes = assetBlob.slice(offset, offset + entry.byteLength);
    await saveAsset(entry.id, bytes.buffer as ArrayBuffer, entry.mimeType);
    offset += entry.byteLength;
  }
}

function compressPack(obj: unknown): Uint8Array {
  const encoded = encode(obj);
  return zlibSync(new Uint8Array(encoded), { level: 6 });
}

function decompressPack<T>(data: Uint8Array): T {
  const decompressed = unzlibSync(data);
  return decode(decompressed) as unknown as T;
}

// ---------------------------------------------------------------------------
// Project (.2dp)
// ---------------------------------------------------------------------------

/**
 * Export a project + all its assets to a compressed .2dp binary.
 */
export async function exportProject(project: Project): Promise<Uint8Array> {
  const assetIds = project.tilesets.map((t) => t.assetId);
  const { manifest, assetBlob } = await packAssets(assetIds);
  const packed: PackedProject = { project, manifest, assetBlob };
  return compressPack(packed);
}

/**
 * Import a .2dp binary back into a Project + store assets in IndexedDB.
 */
export async function importProject(data: Uint8Array): Promise<Project> {
  const packed = decompressPack<PackedProject>(data);
  await unpackAssets(packed.manifest, packed.assetBlob);
  // Backward-compat: ensure terrains array exists for older project files
  if (!packed.project.terrains) {
    packed.project.terrains = [];
  }
  return packed.project;
}

// ---------------------------------------------------------------------------
// Map (.2dm)
// ---------------------------------------------------------------------------

/**
 * Export a single map with its layers and referenced tileset assets.
 */
export async function exportMap(
  map: TileMapData,
  layers: TileLayer[],
  projectTilesets: Tileset[],
): Promise<Uint8Array> {
  // Collect unique tileset IDs referenced by tiles in these layers
  const referencedTilesetIds = new Set<TilesetId>();
  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId);
    }
  }

  // Include only the tilesets actually used
  const tilesets = projectTilesets.filter((t) =>
    referencedTilesetIds.has(t.id),
  );
  const assetIds = tilesets.map((t) => t.assetId);
  const { manifest, assetBlob } = await packAssets(assetIds);

  const packed: PackedMap = { map, layers, tilesets, manifest, assetBlob };
  return compressPack(packed);
}

/**
 * Import a .2dm binary. Restores tileset assets to IndexedDB.
 * Returns the map, its layers, and the tileset metadata needed to render them.
 */
export async function importMap(
  data: Uint8Array,
): Promise<{ map: TileMapData; layers: TileLayer[]; tilesets: Tileset[] }> {
  const packed = decompressPack<PackedMap>(data);
  await unpackAssets(packed.manifest, packed.assetBlob);
  return {
    map: packed.map,
    layers: packed.layers,
    tilesets: packed.tilesets,
  };
}

// ---------------------------------------------------------------------------
// Tileset (.2dt)
// ---------------------------------------------------------------------------

/**
 * Export a single tileset with its image asset.
 */
export async function exportTileset(tileset: Tileset): Promise<Uint8Array> {
  const { manifest, assetBlob } = await packAssets([tileset.assetId]);
  const packed: PackedTileset = { tileset, manifest, assetBlob };
  return compressPack(packed);
}

/**
 * Import a .2dt binary. Restores asset to IndexedDB.
 * Returns the tileset metadata.
 */
export async function importTileset(data: Uint8Array): Promise<Tileset> {
  const packed = decompressPack<PackedTileset>(data);
  await unpackAssets(packed.manifest, packed.assetBlob);
  return packed.tileset;
}

/**
 * Trigger a browser download of the packed binary.
 */
export function downloadFile(data: Uint8Array, filename: string): void {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read a File object into a Uint8Array.
 */
export function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
