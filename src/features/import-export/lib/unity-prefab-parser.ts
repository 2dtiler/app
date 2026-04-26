import {
  buildUnityTileMatrix,
  encodeUnityTextFile,
  parseUnityLayerExportName,
} from "@/features/import-export/lib/unity-bundle-utils";
import type { TileRef } from "@/types";

type UnityYamlDocument = {
  fileId: string;
  objectType: string;
  lines: string[];
};

type UnityGameObjectDocument = {
  fileId: string;
  name: string;
  active: boolean;
};

type UnityTransformDocument = {
  fileId: string;
  gameObjectId: string;
  fatherId: string;
  childIds: string[];
};

type UnityTilemapDocument = {
  fileId: string;
  gameObjectId: string;
  widthInTiles: number;
  heightInTiles: number;
  tileAssetGuids: string[];
  tiles: UnityParsedPrefabTile[];
};

type UnityTileMatrix = ReturnType<typeof buildUnityTileMatrix>;

export interface UnityParsedPrefabTile {
  coordinate: string;
  tileIndex: number;
  rotation?: TileRef["rotation"];
  flipX?: boolean;
  flipY?: boolean;
}

export interface UnityParsedPrefabLayer {
  name: string;
  exportId?: string;
  visible: boolean;
  widthInTiles: number;
  heightInTiles: number;
  tileAssetGuids: string[];
  tiles: UnityParsedPrefabTile[];
}

export interface UnityParsedPrefab {
  widthInTiles: number;
  heightInTiles: number;
  layers: UnityParsedPrefabLayer[];
}

const textDecoder = new TextDecoder();

const UNITY_ROTATIONS: NonNullable<TileRef["rotation"]>[] = [0, 90, 180, 270];

const UNITY_TILE_TRANSFORMS = UNITY_ROTATIONS.flatMap((rotation) =>
  [false, true].flatMap((flipX) =>
    [false, true].map((flipY) => ({
      rotation,
      flipX,
      flipY,
      matrix: buildUnityTileMatrix({ rotation, flipX, flipY }),
    })),
  ),
);

function parseYamlDocuments(text: string) {
  const documents: UnityYamlDocument[] = [];
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  let currentDocument: UnityYamlDocument | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^--- !u!\d+ &(-?\d+)$/);
    if (headerMatch) {
      if (currentDocument) {
        documents.push(currentDocument);
      }
      currentDocument = {
        fileId: headerMatch[1],
        objectType: "",
        lines: [],
      };
      continue;
    }

    if (!currentDocument) {
      continue;
    }

    currentDocument.lines.push(line);
  }

  if (currentDocument) {
    documents.push(currentDocument);
  }

  return documents
    .map((document) => ({
      ...document,
      objectType:
        document.lines
          .find((line) => /^[A-Za-z][A-Za-z0-9_]*:$/.test(line))
          ?.slice(0, -1) ?? "",
    }))
    .filter((document) => document.objectType.length > 0);
}

function parseFileIdReference(line: string, key: string) {
  const match = line.match(new RegExp(`^\\s*${key}: \\{fileID: (-?\\d+)\\}$`));
  return match?.[1] ?? null;
}

function parseScalarNumber(line: string, key: string) {
  const match = line.match(new RegExp(`^\\s*${key}: (-?\\d+)$`));
  return match ? Number(match[1]) : null;
}

function parseGameObjectDocument(document: UnityYamlDocument) {
  const nameLine = document.lines.find((line) => line.startsWith("  m_Name: "));
  const activeLine = document.lines.find((line) =>
    line.startsWith("  m_IsActive: "),
  );

  if (!nameLine || !activeLine) {
    return null;
  }

  return {
    fileId: document.fileId,
    name: nameLine.slice("  m_Name: ".length),
    active: activeLine.endsWith("1"),
  } satisfies UnityGameObjectDocument;
}

function parseTransformChildren(lines: readonly string[], startIndex: number) {
  const childIds: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {2}[A-Za-z]/.test(line)) {
      break;
    }

    const match = line.match(/^ {2}- \{fileID: (-?\d+)\}$/);
    if (match) {
      childIds.push(match[1]);
    }
  }

  return childIds;
}

function parseTransformDocument(document: UnityYamlDocument) {
  const gameObjectLine = document.lines.find((line) =>
    line.startsWith("  m_GameObject: "),
  );
  const fatherLine = document.lines.find((line) =>
    line.startsWith("  m_Father: "),
  );
  const childrenIndex = document.lines.findIndex((line) =>
    line.startsWith("  m_Children:"),
  );

  if (!gameObjectLine || !fatherLine || childrenIndex < 0) {
    return null;
  }

  const gameObjectId = parseFileIdReference(gameObjectLine, "m_GameObject");
  const fatherId = parseFileIdReference(fatherLine, "m_Father");
  if (!gameObjectId || !fatherId) {
    return null;
  }

  return {
    fileId: document.fileId,
    gameObjectId,
    fatherId,
    childIds: document.lines[childrenIndex].endsWith("[]")
      ? []
      : parseTransformChildren(document.lines, childrenIndex),
  } satisfies UnityTransformDocument;
}

function parseUnityVector(line: string, key: string) {
  const match = line.match(
    new RegExp(
      `^\\s*${key}: \\{x: (-?\\d+(?:\\.\\d+)?), y: (-?\\d+(?:\\.\\d+)?), z: (-?\\d+(?:\\.\\d+)?)\\}$`,
    ),
  );

  if (!match) {
    return null;
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

function parseTileAssetGuids(lines: readonly string[], startIndex: number) {
  if (lines[startIndex].endsWith("[]")) {
    return [];
  }

  const tileAssetGuids: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {2}[A-Za-z]/.test(line)) {
      break;
    }

    const match = line.match(
      /^ {2}- \{fileID: -?\d+, guid: ([0-9a-f]{32}), type: \d+\}$/i,
    );
    if (match) {
      tileAssetGuids.push(match[1]);
    }
  }

  return tileAssetGuids;
}

function parseTileEntries(
  lines: readonly string[],
  startIndex: number,
  heightInTiles: number,
) {
  if (lines[startIndex].endsWith("[]")) {
    return [];
  }

  const tiles: UnityParsedPrefabTile[] = [];
  let pendingTile: Omit<
    UnityParsedPrefabTile,
    "rotation" | "flipX" | "flipY"
  > | null = null;
  let currentMatrix: Partial<UnityTileMatrix> = {};

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {2}[A-Za-z]/.test(line)) {
      break;
    }

    const firstMatch = line.match(
      /^ {2}- first: \{x: (-?\d+), y: (-?\d+), z: (-?\d+)\}$/,
    );
    if (firstMatch) {
      if (pendingTile) {
        const transform = decodeUnityTileTransform(currentMatrix);
        tiles.push({
          ...pendingTile,
          rotation: transform.rotation,
          flipX: transform.flipX,
          flipY: transform.flipY,
        });
      }

      const x = Number(firstMatch[1]);
      const unityY = Number(firstMatch[2]);
      pendingTile = {
        coordinate: `${x},${heightInTiles - unityY - 1}`,
        tileIndex: 0,
      };
      currentMatrix = {};
      continue;
    }

    if (!pendingTile) {
      continue;
    }

    const tileIndex = parseScalarNumber(line, "m_TileIndex");
    if (tileIndex !== null) {
      pendingTile.tileIndex = tileIndex;
      continue;
    }

    const matrixMatch = line.match(/^ {8}(e0[01]|e1[01]): (-?\d+(?:\.\d+)?)$/);
    if (matrixMatch) {
      currentMatrix = {
        ...currentMatrix,
        [matrixMatch[1]]: Number(matrixMatch[2]),
      };
    }
  }

  if (pendingTile) {
    const transform = decodeUnityTileTransform(currentMatrix);
    tiles.push({
      ...pendingTile,
      rotation: transform.rotation,
      flipX: transform.flipX,
      flipY: transform.flipY,
    });
  }

  return tiles;
}

function parseTilemapDocument(document: UnityYamlDocument) {
  const gameObjectLine = document.lines.find((line) =>
    line.startsWith("  m_GameObject: "),
  );
  const sizeLine = document.lines.find((line) => line.startsWith("  m_Size: "));
  const tileAssetArrayIndex = document.lines.findIndex((line) =>
    line.startsWith("  m_TileAssetArray:"),
  );
  const tilesIndex = document.lines.findIndex((line) =>
    line.startsWith("  m_Tiles:"),
  );

  if (
    !gameObjectLine ||
    !sizeLine ||
    tileAssetArrayIndex < 0 ||
    tilesIndex < 0
  ) {
    return null;
  }

  const gameObjectId = parseFileIdReference(gameObjectLine, "m_GameObject");
  const size = parseUnityVector(sizeLine, "m_Size");
  if (!gameObjectId || !size) {
    return null;
  }

  return {
    fileId: document.fileId,
    gameObjectId,
    widthInTiles: Math.round(size.x),
    heightInTiles: Math.round(size.y),
    tileAssetGuids: parseTileAssetGuids(document.lines, tileAssetArrayIndex),
    tiles: parseTileEntries(document.lines, tilesIndex, Math.round(size.y)),
  } satisfies UnityTilemapDocument;
}

function decodeUnityTileTransform(matrix: Partial<UnityTileMatrix>) {
  const normalizedMatrix = {
    e00: matrix.e00 ?? 1,
    e01: matrix.e01 ?? 0,
    e10: matrix.e10 ?? 0,
    e11: matrix.e11 ?? 1,
  };

  const match = UNITY_TILE_TRANSFORMS.find(
    (candidate) =>
      candidate.matrix.e00 === normalizedMatrix.e00 &&
      candidate.matrix.e01 === normalizedMatrix.e01 &&
      candidate.matrix.e10 === normalizedMatrix.e10 &&
      candidate.matrix.e11 === normalizedMatrix.e11,
  );

  if (!match) {
    return {
      rotation: 0 as const,
      flipX: false,
      flipY: false,
    };
  }

  return {
    rotation: match.rotation,
    flipX: match.flipX,
    flipY: match.flipY,
  };
}

function orderLayerTilemaps(
  transforms: readonly UnityTransformDocument[],
  tilemapsByGameObjectId: ReadonlyMap<string, UnityTilemapDocument>,
) {
  const transformByFileId = new Map(
    transforms.map((transform) => [transform.fileId, transform]),
  );
  const layerParentCounts = new Map<string, number>();

  for (const transform of transforms) {
    if (!tilemapsByGameObjectId.has(transform.gameObjectId)) {
      continue;
    }

    layerParentCounts.set(
      transform.fatherId,
      (layerParentCounts.get(transform.fatherId) ?? 0) + 1,
    );
  }

  const orderedRootParentId = [...layerParentCounts.entries()].sort(
    ([leftParentId, leftCount], [rightParentId, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      return Number(leftParentId) - Number(rightParentId);
    },
  )[0]?.[0];

  if (!orderedRootParentId) {
    return [...tilemapsByGameObjectId.values()].sort(
      (left, right) => Number(left.fileId) - Number(right.fileId),
    );
  }

  const orderedChildTransforms =
    transformByFileId
      .get(orderedRootParentId)
      ?.childIds.map((childId) => transformByFileId.get(childId))
      .filter((transform): transform is UnityTransformDocument =>
        Boolean(
          transform && tilemapsByGameObjectId.has(transform.gameObjectId),
        ),
      ) ?? [];

  const orderedGameObjectIds = new Set(
    orderedChildTransforms.map((transform) => transform.gameObjectId),
  );

  return [
    ...orderedChildTransforms.map(
      (transform) =>
        tilemapsByGameObjectId.get(
          transform.gameObjectId,
        ) as UnityTilemapDocument,
    ),
    ...[...tilemapsByGameObjectId.values()]
      .filter((tilemap) => !orderedGameObjectIds.has(tilemap.gameObjectId))
      .sort((left, right) => Number(left.fileId) - Number(right.fileId)),
  ];
}

export function parseUnityPrefabTilemap(data: Uint8Array | string) {
  const text = typeof data === "string" ? data : textDecoder.decode(data);
  const documents = parseYamlDocuments(text);
  const gameObjects = documents
    .filter((document) => document.objectType === "GameObject")
    .map(parseGameObjectDocument)
    .filter((document): document is UnityGameObjectDocument =>
      Boolean(document),
    );
  const transforms = documents
    .filter((document) => document.objectType === "Transform")
    .map(parseTransformDocument)
    .filter((document): document is UnityTransformDocument =>
      Boolean(document),
    );
  const tilemaps = documents
    .filter((document) => document.objectType === "Tilemap")
    .map(parseTilemapDocument)
    .filter((document): document is UnityTilemapDocument => Boolean(document));

  if (tilemaps.length === 0) {
    throw new Error(
      "The selected Unity prefab does not contain any Tilemap components.",
    );
  }

  const gameObjectsByFileId = new Map(
    gameObjects.map((gameObject) => [gameObject.fileId, gameObject]),
  );
  const tilemapsByGameObjectId = new Map(
    tilemaps.map((tilemap) => [tilemap.gameObjectId, tilemap]),
  );
  const orderedTilemaps = orderLayerTilemaps(
    transforms,
    tilemapsByGameObjectId,
  );
  const widthInTiles = Math.max(
    ...orderedTilemaps.map((tilemap) => tilemap.widthInTiles),
  );
  const heightInTiles = Math.max(
    ...orderedTilemaps.map((tilemap) => tilemap.heightInTiles),
  );

  return {
    widthInTiles,
    heightInTiles,
    layers: orderedTilemaps.map((tilemap) => {
      const parsedName = parseUnityLayerExportName(
        gameObjectsByFileId.get(tilemap.gameObjectId)?.name ??
          `Layer ${tilemap.fileId}`,
      );

      return {
        name: parsedName.name,
        exportId: parsedName.exportId,
        visible: gameObjectsByFileId.get(tilemap.gameObjectId)?.active ?? true,
        widthInTiles: tilemap.widthInTiles,
        heightInTiles: tilemap.heightInTiles,
        tileAssetGuids: tilemap.tileAssetGuids,
        tiles: tilemap.tiles,
      };
    }),
  } satisfies UnityParsedPrefab;
}

export function encodeUnityPrefabFixture(value: string) {
  return encodeUnityTextFile(value);
}
