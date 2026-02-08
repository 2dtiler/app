/**
 * .2dp Binary Format — Import/Export
 *
 * Format structure:
 *   1. MsgPack-encoded project metadata (JSON-serializable Project object)
 *   2. MsgPack-encoded asset manifest: Array<{ id: AssetId, mimeType: string }>
 *   3. Raw asset blobs concatenated, referenced by byte offsets in the manifest
 *
 * The entire payload is compressed with fflate (zlib deflate).
 */

import { encode, decode } from "@msgpack/msgpack";
import { zlibSync, unzlibSync } from "fflate";
import type { Project, AssetId } from "@/types";
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

/**
 * Export a project + all its assets to a compressed .2dp binary.
 */
export async function exportProject(project: Project): Promise<Uint8Array> {
  // Gather all asset IDs from tilesets
  const assetIds = project.tilesets.map((t) => t.assetId);
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

  // Concatenate all asset bytes
  const totalBytes = assetChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const assetBlob = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of assetChunks) {
    assetBlob.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const packed: PackedProject = { project, manifest, assetBlob };
  const encoded = encode(packed);
  const compressed = zlibSync(new Uint8Array(encoded), { level: 6 });

  return compressed;
}

/**
 * Import a .2dp binary back into a Project + store assets in IndexedDB.
 */
export async function importProject(data: Uint8Array): Promise<Project> {
  const decompressed = unzlibSync(data);
  const packed = decode(decompressed) as unknown as PackedProject;

  const { project, manifest, assetBlob } = packed;

  // Restore assets to IndexedDB
  let offset = 0;
  for (const entry of manifest) {
    const bytes = assetBlob.slice(offset, offset + entry.byteLength);
    await saveAsset(entry.id, bytes.buffer, entry.mimeType);
    offset += entry.byteLength;
  }

  return project;
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
