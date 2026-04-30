import {
  TILED_ANIMATIONS_PROPERTY_KEY,
  findTiledAnimationDefinitionConflicts,
  getTileIndexFromRegion,
  getTileRegionFromIndex,
  getTilesetAnimations,
  normalizeTilesetAnimationConfig,
} from "@/features/map-editor/lib/tileset-animations";
import { generateTilesetAnimationId } from "@/utils/ids";
import type {
  TiledJsonProperty,
  TiledJsonTile,
  TiledJsonTileset,
  Tileset,
  TilesetAnimation,
  TilesetAnimationConfig,
} from "@/types";

function getSerializedAnimationConfig(tileset: Tileset) {
  if (!tileset.animations || getTilesetAnimations(tileset).length === 0) {
    return null;
  }

  return JSON.stringify(normalizeTilesetAnimationConfig(tileset.animations));
}

function parseSerializedAnimationConfig(value: string | undefined) {
  if (!value?.trim()) return null;

  try {
    const parsed = JSON.parse(value) as TilesetAnimationConfig;
    return normalizeTilesetAnimationConfig(parsed);
  } catch {
    return null;
  }
}

export function getTiledAnimationProperties(tileset: Tileset) {
  const serializedConfig = getSerializedAnimationConfig(tileset);
  if (!serializedConfig) return undefined;

  return [
    {
      name: TILED_ANIMATIONS_PROPERTY_KEY,
      type: "string",
      value: serializedConfig,
    },
  ] satisfies TiledJsonProperty[];
}

export function getTiledAnimationTileEntries(tileset: Tileset) {
  const conflicts = findTiledAnimationDefinitionConflicts([tileset]);
  if (conflicts.length > 0) {
    throw new Error(
      `Tiled export cannot represent multiple animations starting from tile ${conflicts[0].localTileId} in tileset ${tileset.name}.`,
    );
  }

  return getTilesetAnimations(tileset).flatMap((animation) => {
    const firstFrame = animation.frames[0];
    if (!firstFrame) return [];

    return firstFrame.cells.flatMap((baseCell, cellIndex) => {
      if (!baseCell) return [];

      const localTileId = getTileIndexFromRegion(tileset, baseCell);
      const frames = animation.frames.flatMap((frame) => {
        const cell = frame.cells[cellIndex];
        if (!cell) return [];

        return [
          {
            tileid: getTileIndexFromRegion(tileset, cell),
            duration: Math.max(1, Math.round(frame.durationMs)),
          },
        ];
      });

      return frames.length > 0
        ? [
            {
              id: localTileId,
              animation: frames,
            },
          ]
        : [];
    });
  }) satisfies TiledJsonTile[];
}

export function buildTiledJsonAnimationFields(tileset: Tileset) {
  const properties = getTiledAnimationProperties(tileset);
  const tileEntries = getTiledAnimationTileEntries(tileset);

  return {
    ...(properties ? { properties } : {}),
    ...(tileEntries.length > 0 ? { tiles: tileEntries } : {}),
  };
}

export function appendXmlTilesetAnimationData(
  document: XMLDocument,
  tilesetElement: Element,
  tileset: Tileset,
) {
  const serializedConfig = getSerializedAnimationConfig(tileset);
  if (serializedConfig) {
    const propertiesElement = document.createElement("properties");
    const propertyElement = document.createElement("property");
    propertyElement.setAttribute("name", TILED_ANIMATIONS_PROPERTY_KEY);
    propertyElement.setAttribute("value", serializedConfig);
    propertiesElement.append(propertyElement);
    tilesetElement.append(propertiesElement);
  }

  for (const tileEntry of getTiledAnimationTileEntries(tileset)) {
    if (tileEntry.id === undefined || !tileEntry.animation?.length) {
      continue;
    }

    const tileElement = document.createElement("tile");
    tileElement.setAttribute("id", String(tileEntry.id));
    const animationElement = document.createElement("animation");

    for (const frame of tileEntry.animation) {
      const frameElement = document.createElement("frame");
      frameElement.setAttribute("tileid", String(frame.tileid ?? 0));
      frameElement.setAttribute("duration", String(frame.duration ?? 1));
      animationElement.append(frameElement);
    }

    tileElement.append(animationElement);
    tilesetElement.append(tileElement);
  }
}

export function readXmlTilesetAnimationConfig(
  tilesetElement: Element,
  tileset: Tileset,
) {
  const propertyElement = Array.from(
    tilesetElement.querySelectorAll(":scope > properties > property"),
  ).find(
    (candidate) =>
      candidate.getAttribute("name") === TILED_ANIMATIONS_PROPERTY_KEY,
  );
  const metadata = parseSerializedAnimationConfig(
    propertyElement?.getAttribute("value") ??
      propertyElement?.textContent ??
      undefined,
  );
  if (metadata) return metadata;

  const animations: TilesetAnimation[] = Array.from(
    tilesetElement.querySelectorAll(":scope > tile"),
  ).flatMap((tileElement) => {
    const animationElement = tileElement.querySelector(":scope > animation");
    if (!animationElement) return [];

    const localTileId = Number(tileElement.getAttribute("id") ?? "0");
    const frames = Array.from(animationElement.querySelectorAll("frame")).map(
      (frameElement) => ({
        durationMs: Math.max(
          1,
          Math.round(Number(frameElement.getAttribute("duration") ?? "120")),
        ),
        cells: [
          getTileRegionFromIndex(
            tileset,
            Number(frameElement.getAttribute("tileid") ?? localTileId),
          ),
        ],
      }),
    );

    return frames.length > 0
      ? [
          {
            id: generateTilesetAnimationId(),
            name: `Tile ${localTileId + 1}`,
            widthInTiles: 1,
            heightInTiles: 1,
            frames,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]
      : [];
  });

  return animations.length > 0
    ? normalizeTilesetAnimationConfig({ version: 1, animations })
    : undefined;
}

export function readJsonTilesetAnimationConfig(
  tileset: Pick<TiledJsonTileset, "properties" | "tiles">,
  targetTileset: Tileset,
) {
  const metadataProperty = (tileset.properties ?? []).find(
    (property) => property.name === TILED_ANIMATIONS_PROPERTY_KEY,
  );
  const metadata = parseSerializedAnimationConfig(
    typeof metadataProperty?.value === "string"
      ? metadataProperty.value
      : metadataProperty?.value !== undefined
        ? String(metadataProperty.value)
        : undefined,
  );
  if (metadata) return metadata;

  const animations: TilesetAnimation[] = (tileset.tiles ?? []).flatMap(
    (tileEntry) => {
      const localTileId = Number(tileEntry.id ?? 0);
      const frames = (tileEntry.animation ?? []).map((frame) => ({
        durationMs: Math.max(1, Math.round(Number(frame.duration ?? 120))),
        cells: [
          getTileRegionFromIndex(
            targetTileset,
            Number(frame.tileid ?? localTileId),
          ),
        ],
      }));

      return frames.length > 0
        ? [
            {
              id: generateTilesetAnimationId(),
              name: `Tile ${localTileId + 1}`,
              widthInTiles: 1,
              heightInTiles: 1,
              frames,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ]
        : [];
    },
  );

  return animations.length > 0
    ? normalizeTilesetAnimationConfig({ version: 1, animations })
    : undefined;
}
