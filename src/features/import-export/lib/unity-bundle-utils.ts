import { normalizeBundlePath } from "@/features/import-export/lib/tiled-xml-utils";
import type { TileRef, UnityBundleManifest } from "@/types";

export const UNITY_PREFAB_IMPORT_ACCEPT =
  ".prefab,text/plain,application/octet-stream";
export const UNITY_BUNDLE_MANIFEST_SUFFIX = ".2dtiler-unity.json";
export const UNITY_TILE_SCRIPT_GUID = "2ec8746730cd2434685714e6b22c0697";
export const UNITY_LAYER_EXPORT_ID_PREFIX = " [2DTILER:";
export const UNITY_TILE_SIZE_USER_DATA_PREFIX = "2dtiler-tile-size=";

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
  return buildUnityTextureMetaFileWithUserData(guid);
}

export function buildUnityTextureMetaFileWithUserData(
  guid: string,
  userData?: string,
) {
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
    `  userData: ${userData ?? ""}`,
    "  spriteSheet:",
    "    serializedVersion: 2",
    "    sprites: []",
    "",
  ].join("\n");
}

export function buildUnityTilesetTextureMetaFile(
  guid: string,
  tileSize: number,
) {
  return buildUnityTextureMetaFileWithUserData(
    guid,
    `${UNITY_TILE_SIZE_USER_DATA_PREFIX}${tileSize}`,
  );
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

export function buildUnityLayerExportName(name: string, exportId: string) {
  return `${name}${UNITY_LAYER_EXPORT_ID_PREFIX}${exportId}]`;
}

export function parseUnityLayerExportName(value: string) {
  const markerIndex = value.lastIndexOf(UNITY_LAYER_EXPORT_ID_PREFIX);
  if (markerIndex === -1 || !value.endsWith("]")) {
    return {
      name: value,
    };
  }

  const exportId = value.slice(
    markerIndex + UNITY_LAYER_EXPORT_ID_PREFIX.length,
    -1,
  );
  if (exportId.length === 0) {
    return {
      name: value,
    };
  }

  return {
    name: value.slice(0, markerIndex),
    exportId,
  };
}

export function parseUnityMetaGuid(data: Uint8Array | string) {
  const text = typeof data === "string" ? data : decoder.decode(data);
  const match = text.match(/^guid: ([0-9a-f]{32})$/im);
  return match?.[1] ?? null;
}

export function parseUnityTileAssetTextureGuid(data: Uint8Array | string) {
  const text = typeof data === "string" ? data : decoder.decode(data);
  const match = text.match(
    /^\s*m_Sprite: \{fileID: -?\d+, guid: ([0-9a-f]{32}), type: \d+\}$/im,
  );
  return match?.[1] ?? null;
}

export function parseUnityTextureMetaTileSize(data: Uint8Array | string) {
  const text = typeof data === "string" ? data : decoder.decode(data);

  const userDataMatch = text.match(
    new RegExp(`${UNITY_TILE_SIZE_USER_DATA_PREFIX}(\\d+)`),
  );
  if (userDataMatch) {
    const tileSize = Number(userDataMatch[1]);
    return Number.isFinite(tileSize) && tileSize > 0 ? tileSize : null;
  }

  const spriteSheetTileSize = parseUnitySpriteSheetTileSize(text);
  if (spriteSheetTileSize) {
    return spriteSheetTileSize;
  }

  return null;
}

function parseUnitySpriteSheetTileSize(text: string) {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const spriteSizes: number[] = [];
  let withinSprites = false;
  let withinRect = false;
  let rectWidth: number | null = null;
  let rectHeight: number | null = null;

  const flushRect = () => {
    if (
      rectWidth !== null &&
      rectHeight !== null &&
      rectWidth > 0 &&
      rectWidth === rectHeight
    ) {
      spriteSizes.push(rectWidth);
    }
    rectWidth = null;
    rectHeight = null;
  };

  for (const line of lines) {
    if (!withinSprites) {
      if (/^\s*spriteSheet:\s*$/.test(line)) {
        withinSprites = true;
      }
      continue;
    }

    if (/^\s{2}[A-Za-z]/.test(line) && !/^\s{2}spriteSheet:/.test(line)) {
      flushRect();
      break;
    }

    if (/^\s{4}sprites:\s*\[\]\s*$/.test(line)) {
      flushRect();
      break;
    }

    if (/^\s{4}-\s/.test(line)) {
      flushRect();
      withinRect = false;
      continue;
    }

    if (/^\s{6}rect:\s*$/.test(line) || /^\s{4}rect:\s*$/.test(line)) {
      flushRect();
      withinRect = true;
      continue;
    }

    if (withinRect) {
      const widthMatch = line.match(/^\s{6,8}width:\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (widthMatch) {
        rectWidth = Math.round(Number(widthMatch[1]));
        continue;
      }

      const heightMatch = line.match(/^\s{6,8}height:\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (heightMatch) {
        rectHeight = Math.round(Number(heightMatch[1]));
        continue;
      }

      if (/^\s{4,6}[A-Za-z]/.test(line)) {
        flushRect();
        withinRect = false;
      }
    }
  }

  flushRect();
  if (spriteSizes.length === 0) {
    return null;
  }

  const distinctSizes = [...new Set(spriteSizes)];
  if (distinctSizes.length !== 1) {
    return null;
  }

  return distinctSizes[0];
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
