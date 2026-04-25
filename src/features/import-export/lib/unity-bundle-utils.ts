import { normalizeBundlePath } from "@/features/import-export/lib/tiled-xml-utils";
import type { TileRef, UnityBundleManifest } from "@/types";

export const UNITY_PREFAB_IMPORT_ACCEPT =
  ".prefab,text/plain,application/octet-stream";
export const UNITY_BUNDLE_MANIFEST_SUFFIX = ".2dtiler-unity.json";
export const UNITY_TILE_SCRIPT_GUID = "2ec8746730cd2434685714e6b22c0697";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function buildUnityBundleManifestPath(rootPath: string) {
  const normalizedRootPath = normalizeBundlePath(rootPath);

  if (normalizedRootPath.toLowerCase().endsWith(".prefab")) {
    return `${normalizedRootPath.slice(0, -7)}${UNITY_BUNDLE_MANIFEST_SUFFIX}`;
  }

  return `${normalizedRootPath}${UNITY_BUNDLE_MANIFEST_SUFFIX}`;
}

export function encodeUnityBundleManifest(manifest: UnityBundleManifest) {
  return encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

export function parseUnityBundleManifest(
  data: Uint8Array,
): UnityBundleManifest {
  const parsed = JSON.parse(decoder.decode(data)) as UnityBundleManifest;

  if (parsed.source !== "2dtiler" || parsed.version !== 1) {
    throw new Error(
      "Unsupported Unity bundle manifest. Export the bundle from 2D Tiler and try again.",
    );
  }

  return parsed;
}

export function generateUnityGuid() {
  return crypto.randomUUID().replaceAll("-", "");
}

export function encodeUnityTextFile(value: string) {
  return encoder.encode(value.endsWith("\n") ? value : `${value}\n`);
}

export function buildUnityGenericMetaFile(guid: string) {
  return [
    "fileFormatVersion: 2",
    `guid: ${guid}`,
    "DefaultImporter:",
    "  externalObjects: {}",
    "  userData: ",
    "  assetBundleName: ",
    "  assetBundleVariant: ",
    "",
  ].join("\n");
}

export function buildUnityTextureMetaFile(guid: string) {
  return [
    "fileFormatVersion: 2",
    `guid: ${guid}`,
    "TextureImporter:",
    "  internalIDToNameTable: []",
    "  externalObjects: {}",
    "  serializedVersion: 13",
    "  mipmaps:",
    "    enableMipMap: 0",
    "  textureSettings:",
    "    serializedVersion: 2",
    "    filterMode: 0",
    "    aniso: 1",
    "    mipBias: 0",
    "    wrapU: 1",
    "    wrapV: 1",
    "    wrapW: 1",
    "  spriteMode: 1",
    "  spritePixelsToUnits: 100",
    "  spriteSheet:",
    "    serializedVersion: 2",
    "    sprites: []",
    "",
  ].join("\n");
}

export function buildUnityTileAssetFile(tileName: string, textureGuid: string) {
  return [
    "%YAML 1.1",
    "%TAG !u! tag:unity3d.com,2011:",
    "--- !u!114 &11400000",
    "MonoBehaviour:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    "  m_GameObject: {fileID: 0}",
    "  m_Enabled: 1",
    "  m_EditorHideFlags: 0",
    `  m_Name: ${tileName}`,
    `  m_Script: {fileID: 11500000, guid: ${UNITY_TILE_SCRIPT_GUID}, type: 3}`,
    `  m_Sprite: {fileID: 21300000, guid: ${textureGuid}, type: 3}`,
    "  m_Color: {r: 1, g: 1, b: 1, a: 1}",
    "  m_Transform:",
    "    e00: 1",
    "    e01: 0",
    "    e02: 0",
    "    e03: 0",
    "    e10: 0",
    "    e11: 1",
    "    e12: 0",
    "    e13: 0",
    "    e20: 0",
    "    e21: 0",
    "    e22: 1",
    "    e23: 0",
    "    e30: 0",
    "    e31: 0",
    "    e32: 0",
    "    e33: 1",
    "  m_InstancedGameObject: {fileID: 0}",
    "  m_Flags: 1",
    "  m_ColliderType: 0",
    "",
  ].join("\n");
}

export function getUnityTileKey(
  ref: Pick<TileRef, "tilesetId" | "sx" | "sy" | "sw" | "sh">,
) {
  return `${ref.tilesetId}:${ref.sx}:${ref.sy}:${ref.sw}:${ref.sh}`;
}

function normalizeMatrixValue(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

export function buildUnityTileMatrix(
  ref: Pick<TileRef, "rotation" | "flipX" | "flipY">,
) {
  const rotation = ref.rotation ?? 0;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  const scaleX = ref.flipX ? -1 : 1;
  const scaleY = ref.flipY ? -1 : 1;

  return {
    e00: normalizeMatrixValue(scaleX * cos),
    e01: normalizeMatrixValue(scaleX * -sin),
    e02: 0,
    e03: 0,
    e10: normalizeMatrixValue(scaleY * sin),
    e11: normalizeMatrixValue(scaleY * cos),
    e12: 0,
    e13: 0,
    e20: 0,
    e21: 0,
    e22: 1,
    e23: 0,
    e30: 0,
    e31: 0,
    e32: 0,
    e33: 1,
  };
}
