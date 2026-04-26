import { getAsset } from "@/services/db";
import { generateLayerId, generateMapId, generateTilesetId } from "@/utils/ids";
import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  createXmlDocument,
  decodeText,
  encodeXmlDocument,
  getFileExtensionFromMimeType,
  normalizeBundlePath,
  parseXmlDocument,
  resolveBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import type {
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TideAnimatedCellDocument,
  TideImportMissingResource,
  TideLayerCellDocument,
  TideLayerDocument,
  TideMapDocument,
  TideMapImportPreparationResult,
  TideMapImportResult,
  TidePropertyDocument,
  TidePropertyType,
  TideStaticCellDocument,
  TideTileSheetDocument,
  TideTileSheetRefCellDocument,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";
import { TILE_SIZES } from "@/types";

export const TIDE_MAP_IMPORT_ACCEPT =
  ".tide,text/xml,application/xml,text/plain,application/octet-stream";

const IMPORT_MAP_GROUP_ID = "__tide-import-map-group__";
const IMPORT_TILESET_GROUP_ID = "__tide-import-tileset-group__";

function parseDimensionPair(value: string | null, label: string) {
  const [rawLeft = "0", rawRight = "0"] = (value ?? "")
    .split(" x ")
    .map((segment) => segment.trim());
  const left = Number(rawLeft);
  const right = Number(rawRight);

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new Error(`Invalid tIDE ${label}: ${value ?? ""}.`);
  }

  return { left, right };
}

function getDirectChildElements(parent: Element, tagName?: string) {
  return Array.from(parent.children).filter(
    (child) => !tagName || child.tagName === tagName,
  );
}

function getRequiredChild(parent: Element, tagName: string) {
  const child = getDirectChildElements(parent, tagName)[0];
  if (!child) {
    throw new Error(`Missing tIDE ${tagName} element.`);
  }
  return child;
}

function toTidePropertyType(type: PropertyValue["type"]): TidePropertyType {
  if (type === "bool") {
    return "Boolean";
  }

  if (type === "int") {
    return "Int32";
  }

  return "String";
}

function fromTidePropertyType(type?: TidePropertyType): PropertyValue["type"] {
  if (type === "Boolean") {
    return "bool";
  }

  if (type === "Int32") {
    return "int";
  }

  return "string";
}

function stringifyPropertyValue(property: PropertyValue) {
  if (property.type === "bool") {
    return property.value === "true" ? "true" : "false";
  }

  return property.value;
}

function buildTideProperties(
  properties: Record<string, PropertyValue> | undefined,
): TidePropertyDocument[] {
  return Object.entries(properties ?? {}).map(([key, property]) => ({
    key,
    type: toTidePropertyType(property.type),
    value: stringifyPropertyValue(property),
  }));
}

function parseTideProperties(parent: Element) {
  const propertiesElement = getDirectChildElements(parent, "Properties")[0];
  if (!propertiesElement) {
    return {} as Record<string, PropertyValue>;
  }

  return Object.fromEntries(
    getDirectChildElements(propertiesElement, "Property")
      .map((propertyElement) => {
        const key = propertyElement.getAttribute("Key")?.trim();
        if (!key) {
          return null;
        }

        const type = propertyElement.getAttribute(
          "Type",
        ) as TidePropertyType | null;
        return [
          key,
          {
            value: propertyElement.textContent ?? "",
            type: fromTidePropertyType(type ?? undefined),
          } satisfies PropertyValue,
        ] as const;
      })
      .filter((entry) => entry !== null),
  );
}

function parseTileSheetElement(
  tileSheetElement: Element,
): TideTileSheetDocument {
  const alignment = getRequiredChild(tileSheetElement, "Alignment");
  const sheetSize = parseDimensionPair(
    alignment.getAttribute("SheetSize"),
    "sheet size",
  );
  const tileSize = parseDimensionPair(
    alignment.getAttribute("TileSize"),
    "tile size",
  );
  const margin = parseDimensionPair(
    alignment.getAttribute("Margin") ?? "0 x 0",
    "margin",
  );
  const spacing = parseDimensionPair(
    alignment.getAttribute("Spacing") ?? "0 x 0",
    "spacing",
  );

  return {
    id: tileSheetElement.getAttribute("Id")?.trim() || "TileSheet",
    description:
      getDirectChildElements(
        tileSheetElement,
        "Description",
      )[0]?.textContent?.trim() ||
      tileSheetElement.getAttribute("Id")?.trim() ||
      "Tile Sheet",
    imageSource:
      getRequiredChild(tileSheetElement, "ImageSource").textContent?.trim() ||
      "",
    sheetWidth: sheetSize.left,
    sheetHeight: sheetSize.right,
    tileWidth: tileSize.left,
    tileHeight: tileSize.right,
    marginX: margin.left,
    marginY: margin.right,
    spacingX: spacing.left,
    spacingY: spacing.right,
    properties: buildTideProperties(parseTideProperties(tileSheetElement)),
  };
}

function parseAnimatedElement(
  animatedElement: Element,
): TideAnimatedCellDocument {
  const framesElement = getRequiredChild(animatedElement, "Frames");
  const frames = getDirectChildElements(framesElement).map((frameChild) => {
    if (frameChild.tagName === "TileSheet") {
      return {
        kind: "tilesheet",
        ref: frameChild.getAttribute("Ref")?.trim() || "",
      } satisfies TideTileSheetRefCellDocument;
    }

    if (frameChild.tagName === "Static") {
      return {
        kind: "static",
        index: Number(frameChild.getAttribute("Index") ?? "-1"),
      } satisfies TideStaticCellDocument;
    }

    throw new Error(
      `Unsupported tIDE animated frame element: ${frameChild.tagName}.`,
    );
  });

  return {
    kind: "animated",
    interval: Number(animatedElement.getAttribute("Interval") ?? "0"),
    frames,
  };
}

function parseLayerRow(rowElement: Element) {
  return getDirectChildElements(rowElement).map(
    (child): TideLayerCellDocument => {
      if (child.tagName === "TileSheet") {
        return {
          kind: "tilesheet",
          ref: child.getAttribute("Ref")?.trim() || "",
        };
      }

      if (child.tagName === "Null") {
        return {
          kind: "null",
          count: Number(child.getAttribute("Count") ?? "1"),
        };
      }

      if (child.tagName === "Static") {
        return {
          kind: "static",
          index: Number(child.getAttribute("Index") ?? "-1"),
        };
      }

      if (child.tagName === "Animated") {
        return parseAnimatedElement(child);
      }

      throw new Error(`Unsupported tIDE layer element: ${child.tagName}.`);
    },
  );
}

function parseLayerElement(layerElement: Element): TideLayerDocument {
  const dimensions = getRequiredChild(layerElement, "Dimensions");
  const layerSize = parseDimensionPair(
    dimensions.getAttribute("LayerSize"),
    "layer size",
  );
  const tileSize = parseDimensionPair(
    dimensions.getAttribute("TileSize"),
    "tile size",
  );
  const tileArray = getRequiredChild(layerElement, "TileArray");

  return {
    id: layerElement.getAttribute("Id")?.trim() || "Layer",
    visible:
      (layerElement.getAttribute("Visible") ?? "True").toLowerCase() !==
      "false",
    width: layerSize.left,
    height: layerSize.right,
    tileWidth: tileSize.left,
    tileHeight: tileSize.right,
    rows: getDirectChildElements(tileArray, "Row").map(parseLayerRow),
    properties: buildTideProperties(parseTideProperties(layerElement)),
  };
}

function parseTideDocument(
  rootPath: string,
  data: Uint8Array,
): TideMapDocument {
  const document = parseXmlDocument(decodeText(data));
  const root = document.documentElement;

  if (!root) {
    throw new Error(`Invalid tIDE map document: ${rootPath}.`);
  }

  const tileSheets = getDirectChildElements(
    getRequiredChild(root, "TileSheets"),
    "TileSheet",
  ).map(parseTileSheetElement);
  const layers = getDirectChildElements(
    getRequiredChild(root, "Layers"),
    "Layer",
  ).map(parseLayerElement);

  if (layers.length === 0) {
    throw new Error("tIDE import requires at least one layer.");
  }

  return {
    properties: buildTideProperties(parseTideProperties(root)),
    tileSheets,
    layers,
  };
}

function validateTideTileSize(tileWidth: number, tileHeight: number) {
  if (tileWidth <= 0 || tileHeight <= 0 || tileWidth !== tileHeight) {
    throw new Error("Only square tIDE maps are supported.");
  }

  if (!TILE_SIZES.includes(tileWidth as (typeof TILE_SIZES)[number])) {
    throw new Error(`Unsupported tIDE tile size: ${tileWidth}.`);
  }

  return tileWidth as TileMapData["tileSize"];
}

function getTideColumns(tileSheet: TideTileSheetDocument) {
  const availableWidth =
    tileSheet.sheetWidth - tileSheet.marginX * 2 + tileSheet.spacingX;
  const columns = Math.floor(
    availableWidth / (tileSheet.tileWidth + tileSheet.spacingX),
  );

  if (columns <= 0) {
    throw new Error(`Invalid tIDE tilesheet dimensions for ${tileSheet.id}.`);
  }

  return columns;
}

function buildMissingResources(
  rootPath: string,
  mapDocument: TideMapDocument,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const missingResources = new Map<string, TideImportMissingResource>();

  for (const tileSheet of mapDocument.tileSheets) {
    const resolvedImagePath = resolveBundlePath(
      rootPath,
      tileSheet.imageSource,
    );
    if (getProvidedEntry(providedEntries, resolvedImagePath)) {
      continue;
    }

    missingResources.set(normalizeBundlePath(resolvedImagePath), {
      path: normalizeBundlePath(resolvedImagePath),
      kind: "image",
      referringPath: normalizeBundlePath(rootPath),
      label: "Image asset",
    });
  }

  return [...missingResources.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function createTileSheetIndexLookup(tileSheet: TideTileSheetDocument) {
  const columns = getTideColumns(tileSheet);

  return (index: number) => ({
    sx:
      tileSheet.marginX +
      (index % columns) * (tileSheet.tileWidth + tileSheet.spacingX),
    sy:
      tileSheet.marginY +
      Math.floor(index / columns) * (tileSheet.tileHeight + tileSheet.spacingY),
  });
}

function materializeLayerTiles(
  layer: TideLayerDocument,
  tileSheetsById: ReadonlyMap<
    string,
    { document: TideTileSheetDocument; tileset: Tileset }
  >,
) {
  const tiles: TileLayer["tiles"] = {};
  let currentTileSheetId: string | null = null;

  for (let rowIndex = 0; rowIndex < layer.rows.length; rowIndex += 1) {
    const row = layer.rows[rowIndex];
    let cellX = 0;

    for (const cell of row) {
      if (cell.kind === "tilesheet") {
        currentTileSheetId = cell.ref;
        continue;
      }

      if (cell.kind === "null") {
        cellX += Math.max(0, cell.count);
        continue;
      }

      if (cell.kind === "animated") {
        throw new Error("Animated tIDE tiles are not supported.");
      }

      if (!currentTileSheetId) {
        throw new Error(
          `tIDE row in layer ${layer.id} references a tile before selecting a tilesheet.`,
        );
      }

      const tileSheetEntry = tileSheetsById.get(currentTileSheetId);
      if (!tileSheetEntry) {
        throw new Error(
          `Unknown tIDE tilesheet reference: ${currentTileSheetId}.`,
        );
      }

      const { sx, sy } = createTileSheetIndexLookup(tileSheetEntry.document)(
        cell.index,
      );
      tiles[`${cellX},${rowIndex}`] = {
        tilesetId: tileSheetEntry.tileset.id,
        sx,
        sy,
        sw: tileSheetEntry.tileset.tileSize,
        sh: tileSheetEntry.tileset.tileSize,
      };
      cellX += 1;
    }

    if (cellX !== layer.width) {
      throw new Error(
        `tIDE layer ${layer.id} row width does not match its declared dimensions.`,
      );
    }
  }

  if (layer.rows.length !== layer.height) {
    throw new Error(
      `tIDE layer ${layer.id} row count does not match its declared dimensions.`,
    );
  }

  return tiles;
}

function assertTideExportSupported(
  map: TileMapData,
  imageLayers: ImageLayer[],
  layerGroups: LayerGroup[],
  objectLayers: ObjectLayer[],
  objects: MapObject[],
) {
  if (map.orientation !== "orthogonal") {
    throw new Error("tIDE export currently supports orthogonal maps only.");
  }

  if (imageLayers.length > 0 || objectLayers.length > 0 || objects.length > 0) {
    throw new Error("tIDE export currently supports tile layers only.");
  }

  if (layerGroups.length > 0) {
    throw new Error("tIDE export currently does not support layer groups.");
  }
}

function buildTileSheetLookup(layers: TileLayer[], tilesets: Tileset[]) {
  const referencedTilesetIds = new Set<string>();
  for (const layer of layers) {
    for (const tile of Object.values(layer.tiles)) {
      referencedTilesetIds.add(tile.tilesetId as string);
    }
  }

  return tilesets.filter((tileset) =>
    referencedTilesetIds.has(tileset.id as string),
  );
}

function getTileLocalIndex(tile: TileLayer["tiles"][string], tileset: Tileset) {
  if (tile.rotation || tile.flipX || tile.flipY) {
    throw new Error("tIDE export does not support tile rotation or flips.");
  }

  if (tile.sw !== tileset.tileSize || tile.sh !== tileset.tileSize) {
    throw new Error(`Tile size mismatch for tileset ${tileset.name}.`);
  }

  if (tile.sx % tileset.tileSize !== 0 || tile.sy % tileset.tileSize !== 0) {
    throw new Error(
      `tIDE export only supports zero-margin, zero-spacing tilesets for ${tileset.name}.`,
    );
  }

  const columns = Math.max(
    1,
    Math.floor(tileset.imageWidth / tileset.tileSize),
  );
  const column = tile.sx / tileset.tileSize;
  const row = tile.sy / tileset.tileSize;
  return row * columns + column;
}

function appendPropertyElements(
  document: XMLDocument,
  parent: Element,
  properties: TidePropertyDocument[],
) {
  if (properties.length === 0) {
    return;
  }

  const propertiesElement = document.createElement("Properties");
  for (const property of properties) {
    const propertyElement = document.createElement("Property");
    propertyElement.setAttribute("Key", property.key);
    if (property.type && property.type !== "String") {
      propertyElement.setAttribute("Type", property.type);
    }
    propertyElement.textContent = property.value;
    propertiesElement.append(propertyElement);
  }
  parent.append(propertiesElement);
}

export async function prepareTideMapImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<TideMapImportPreparationResult> {
  const providedEntries = buildEntryMap(entries);
  const rootData = requireProvidedEntry(providedEntries, rootPath);
  const mapDocument = parseTideDocument(rootPath, rootData);
  const missingResources = buildMissingResources(
    rootPath,
    mapDocument,
    providedEntries,
  );

  if (missingResources.length > 0) {
    return {
      status: "missing-resources",
      rootPath: normalizeBundlePath(rootPath),
      missingResources,
    };
  }

  const firstLayer = mapDocument.layers[0];
  const tileSize = validateTideTileSize(
    firstLayer.tileWidth,
    firstLayer.tileHeight,
  );

  const tilesetEntries = await Promise.all(
    mapDocument.tileSheets.map(async (tileSheet) => {
      const tilesetTileSize = validateTideTileSize(
        tileSheet.tileWidth,
        tileSheet.tileHeight,
      );
      if (tilesetTileSize !== tileSize) {
        throw new Error(
          "tIDE import requires all tilesheets to use the same tile size as the map layers.",
        );
      }

      const resolvedImagePath = resolveBundlePath(
        rootPath,
        tileSheet.imageSource,
      );
      const importedImage = await importImageAsset(
        resolvedImagePath,
        requireProvidedEntry(providedEntries, resolvedImagePath),
      );
      const tileset: Tileset = {
        id: generateTilesetId(),
        name: tileSheet.description || tileSheet.id,
        groupId: IMPORT_TILESET_GROUP_ID as Tileset["groupId"],
        tileSize,
        assetId: importedImage.assetId,
        imageWidth: importedImage.width,
        imageHeight: importedImage.height,
        createdAt: Date.now(),
      };

      return {
        document: tileSheet,
        tileset,
      };
    }),
  );

  const tileSheetsById = new Map(
    tilesetEntries.map((entry) => [entry.document.id, entry]),
  );
  const mapId = generateMapId();
  const layers = mapDocument.layers.map((layer) => {
    const layerTileSize = validateTideTileSize(
      layer.tileWidth,
      layer.tileHeight,
    );
    if (
      layer.width !== firstLayer.width ||
      layer.height !== firstLayer.height
    ) {
      throw new Error(
        "tIDE import requires all layers to share the same dimensions.",
      );
    }
    if (layerTileSize !== tileSize) {
      throw new Error(
        "tIDE import requires all layers to share the same tile size.",
      );
    }

    return {
      id: generateLayerId(),
      mapId,
      name: layer.id,
      visible: layer.visible,
      locked: false,
      tiles: materializeLayerTiles(layer, tileSheetsById),
    } satisfies TileLayer;
  });

  const result: TideMapImportResult = {
    map: {
      id: mapId,
      name: stripExtension(rootPath),
      groupId: IMPORT_MAP_GROUP_ID as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles: firstLayer.width,
      heightInTiles: firstLayer.height,
      tileSize,
      properties: parseTideProperties(
        parseXmlDocument(decodeText(rootData)).documentElement,
      ),
      layerOrder: layers.map((layer) => layer.id),
      createdAt: Date.now(),
    },
    layers,
    tilesets: tilesetEntries.map((entry) => entry.tileset),
    overrideTilesets: [],
    imageLayers: [],
    layerGroups: [],
    objectLayers: [],
    objects: [],
  };

  return {
    status: "ready",
    result,
  };
}

export async function exportTideMapBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
) {
  assertTideExportSupported(
    map,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
  );

  const referencedTilesets = buildTileSheetLookup(layers, tilesets);
  const usedPaths = new Set<string>();
  const entries: ImportExportArchiveEntry[] = [];
  const imagePathsByTilesetId = new Map<string, string>();

  for (const tileset of referencedTilesets) {
    const assetRecord = await getAsset(tileset.assetId);
    if (!assetRecord) {
      throw new Error(`Missing tileset asset for ${tileset.name}.`);
    }

    const extension = getFileExtensionFromMimeType(assetRecord.mimeType);
    const imagePath = createRelativeAssetPath(
      "images",
      tileset.name,
      extension,
      usedPaths,
    );
    imagePathsByTilesetId.set(tileset.id as string, imagePath);
    entries.push({
      path: imagePath,
      data: new Uint8Array(assetRecord.data),
    });
  }

  const document = createXmlDocument("Map");
  const root = document.documentElement;
  appendPropertyElements(document, root, buildTideProperties(map.properties));

  const tileSheetsElement = document.createElement("TileSheets");
  const tileSheetIdsByTilesetId = new Map<string, string>();

  for (const tileset of referencedTilesets) {
    const tileSheetId =
      tileset.name || `Tileset-${tileSheetIdsByTilesetId.size + 1}`;
    tileSheetIdsByTilesetId.set(tileset.id as string, tileSheetId);

    const tileSheetElement = document.createElement("TileSheet");
    tileSheetElement.setAttribute("Id", tileSheetId);

    const descriptionElement = document.createElement("Description");
    descriptionElement.textContent = tileset.name;
    tileSheetElement.append(descriptionElement);

    const imageSourceElement = document.createElement("ImageSource");
    imageSourceElement.textContent =
      imagePathsByTilesetId.get(tileset.id as string) ?? "";
    tileSheetElement.append(imageSourceElement);

    const alignmentElement = document.createElement("Alignment");
    alignmentElement.setAttribute(
      "SheetSize",
      `${tileset.imageWidth} x ${tileset.imageHeight}`,
    );
    alignmentElement.setAttribute(
      "TileSize",
      `${tileset.tileSize} x ${tileset.tileSize}`,
    );
    alignmentElement.setAttribute("Margin", "0 x 0");
    alignmentElement.setAttribute("Spacing", "0 x 0");
    tileSheetElement.append(alignmentElement);
    tileSheetsElement.append(tileSheetElement);
  }
  root.append(tileSheetsElement);

  const layersElement = document.createElement("Layers");
  for (const layer of layers) {
    const layerElement = document.createElement("Layer");
    layerElement.setAttribute("Id", layer.name);
    layerElement.setAttribute("Visible", layer.visible ? "True" : "False");

    const dimensionsElement = document.createElement("Dimensions");
    dimensionsElement.setAttribute(
      "LayerSize",
      `${map.widthInTiles} x ${map.heightInTiles}`,
    );
    dimensionsElement.setAttribute(
      "TileSize",
      `${map.tileSize} x ${map.tileSize}`,
    );
    layerElement.append(dimensionsElement);
    appendPropertyElements(
      document,
      layerElement,
      buildTideProperties(undefined),
    );

    const tileArrayElement = document.createElement("TileArray");
    for (let y = 0; y < map.heightInTiles; y += 1) {
      const rowElement = document.createElement("Row");
      let activeTilesetId: string | null = null;
      let nullRun = 0;

      const flushNullRun = () => {
        if (nullRun <= 0) {
          return;
        }
        const nullElement = document.createElement("Null");
        nullElement.setAttribute("Count", String(nullRun));
        rowElement.append(nullElement);
        nullRun = 0;
      };

      for (let x = 0; x < map.widthInTiles; x += 1) {
        const tile = layer.tiles[`${x},${y}`];
        if (!tile) {
          nullRun += 1;
          continue;
        }

        flushNullRun();
        const tileset = referencedTilesets.find(
          (candidate) => candidate.id === tile.tilesetId,
        );
        if (!tileset) {
          throw new Error(`Missing tileset for tile layer ${layer.name}.`);
        }

        if (activeTilesetId !== (tileset.id as string)) {
          const tileSheetElement = document.createElement("TileSheet");
          tileSheetElement.setAttribute(
            "Ref",
            tileSheetIdsByTilesetId.get(tileset.id as string) ?? tileset.name,
          );
          rowElement.append(tileSheetElement);
          activeTilesetId = tileset.id as string;
        }

        const staticElement = document.createElement("Static");
        staticElement.setAttribute(
          "Index",
          String(getTileLocalIndex(tile, tileset)),
        );
        rowElement.append(staticElement);
      }

      flushNullRun();
      tileArrayElement.append(rowElement);
    }

    layerElement.append(tileArrayElement);
    layersElement.append(layerElement);
  }
  root.append(layersElement);

  const mapPath = `${stripExtension(map.name) || "map"}.tide`;
  entries.unshift({
    path: mapPath,
    data: encodeXmlDocument(document),
  });

  return entries;
}
