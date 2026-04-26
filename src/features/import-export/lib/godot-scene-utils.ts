import type { GodotMapExportOptions, TileRef } from "@/types";

export const GODOT_TILE_TRANSFORM_FLIP_H = 4096;
export const GODOT_TILE_TRANSFORM_FLIP_V = 8192;
export const GODOT_TILE_TRANSFORM_TRANSPOSE = 16384;

export const DEFAULT_GODOT_MAP_EXPORT_OPTIONS: GodotMapExportOptions = {
  sceneRootName: "",
  tilesetMode: "embedded",
  textureMode: "copy",
};

function getRotationMatrix(rotation: number) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  switch (normalizedRotation) {
    case 0:
      return { a: 1, b: 0, c: 0, d: 1 };
    case 90:
      return { a: 0, b: -1, c: 1, d: 0 };
    case 180:
      return { a: -1, b: 0, c: 0, d: -1 };
    case 270:
      return { a: 0, b: 1, c: -1, d: 0 };
    default:
      throw new Error(`Unsupported tile rotation: ${rotation}.`);
  }
}

function getTransformKey(rotation: number, flipX: boolean, flipY: boolean) {
  const { a, b, c, d } = getRotationMatrix(rotation);
  const scaleX = flipX ? -1 : 1;
  const scaleY = flipY ? -1 : 1;
  return `${a * scaleX},${b * scaleY},${c * scaleX},${d * scaleY}`;
}

export function encodeGodotAlternativeTile(
  ref: Pick<TileRef, "rotation" | "flipX" | "flipY">,
) {
  const transformKey = getTransformKey(
    ref.rotation ?? 0,
    ref.flipX ?? false,
    ref.flipY ?? false,
  );

  switch (transformKey) {
    case "1,0,0,1":
      return 0;
    case "-1,0,0,1":
      return GODOT_TILE_TRANSFORM_FLIP_H;
    case "1,0,0,-1":
      return GODOT_TILE_TRANSFORM_FLIP_V;
    case "-1,0,0,-1":
      return GODOT_TILE_TRANSFORM_FLIP_H | GODOT_TILE_TRANSFORM_FLIP_V;
    case "0,-1,1,0":
      return GODOT_TILE_TRANSFORM_TRANSPOSE | GODOT_TILE_TRANSFORM_FLIP_H;
    case "0,1,-1,0":
      return GODOT_TILE_TRANSFORM_TRANSPOSE | GODOT_TILE_TRANSFORM_FLIP_V;
    case "0,1,1,0":
      return GODOT_TILE_TRANSFORM_TRANSPOSE;
    case "0,-1,-1,0":
      return (
        GODOT_TILE_TRANSFORM_TRANSPOSE |
        GODOT_TILE_TRANSFORM_FLIP_H |
        GODOT_TILE_TRANSFORM_FLIP_V
      );
    default:
      throw new Error("Unsupported tile transform for Godot export.");
  }
}

export function decodeGodotAlternativeTile(alternativeTile: number) {
  const normalizedAlternativeTile =
    alternativeTile &
    (GODOT_TILE_TRANSFORM_FLIP_H |
      GODOT_TILE_TRANSFORM_FLIP_V |
      GODOT_TILE_TRANSFORM_TRANSPOSE);
  const variants: Array<Pick<TileRef, "rotation" | "flipX" | "flipY">> = [
    {},
    { flipX: true },
    { flipY: true },
    { flipX: true, flipY: true },
    { rotation: 90 },
    { rotation: 90, flipX: true },
    { rotation: 90, flipY: true },
    { rotation: 90, flipX: true, flipY: true },
    { rotation: 180 },
    { rotation: 180, flipX: true },
    { rotation: 180, flipY: true },
    { rotation: 180, flipX: true, flipY: true },
    { rotation: 270 },
    { rotation: 270, flipX: true },
    { rotation: 270, flipY: true },
    { rotation: 270, flipX: true, flipY: true },
  ];

  for (const variant of variants) {
    if (encodeGodotAlternativeTile(variant) === normalizedAlternativeTile) {
      return {
        rotation: variant.rotation,
        flipX: variant.flipX,
        flipY: variant.flipY,
      };
    }
  }

  throw new Error("Unsupported tile transform for Godot import.");
}

export function escapeGodotString(value: string) {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function formatGodotVector2(x: number, y: number) {
  return `Vector2(${x}, ${y})`;
}

export function formatGodotVector2i(x: number, y: number) {
  return `Vector2i(${x}, ${y})`;
}

export function formatGodotColorRgba(
  red: number,
  green: number,
  blue: number,
  alpha = 1,
) {
  return `Color(${red}, ${green}, ${blue}, ${alpha})`;
}

export function resolveGodotSceneRootName(
  mapName: string,
  options?: Pick<GodotMapExportOptions, "sceneRootName">,
) {
  const candidate = options?.sceneRootName.trim();
  return candidate && candidate.length > 0 ? candidate : mapName;
}
