import {
  encodeJsonDocument,
  TILED_FORMAT_VERSION,
} from "@/lib/import-export-tiled-shared";
import { parseTiledLuaDocument } from "@/lib/tiled-lua";
import { normalizeBundlePath } from "@/lib/tiled-xml-utils";
import type {
  ImportExportArchiveEntry,
  TiledLayerCompression,
  TiledLayerEncoding,
  TiledJsonGroupLayer,
  TiledJsonImageLayer,
  TiledJsonLayer,
  TiledJsonMap,
  TiledJsonObject,
  TiledJsonObjectLayer,
  TiledJsonProperty,
  TiledJsonTileLayer,
  TiledJsonTileset,
} from "@/types";

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readLayerEncoding(value: unknown): TiledLayerEncoding | undefined {
  return value === "base64" || value === "csv" ? value : undefined;
}

function readLayerCompression(
  value: unknown,
): TiledLayerCompression | undefined {
  return value === "none" || value === "gzip" || value === "zlib"
    ? value
    : undefined;
}

function convertLuaPropertiesToJson(propertiesValue: unknown) {
  const properties = asObject(propertiesValue);
  if (!properties) {
    return undefined;
  }

  const entries: TiledJsonProperty[] = [];

  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === "boolean") {
      entries.push({ name, type: "bool", value });
      continue;
    }

    if (typeof value === "number") {
      entries.push({
        name,
        type: Number.isInteger(value) ? "int" : "float",
        value,
      });
      continue;
    }

    if (typeof value === "string") {
      entries.push({ name, value });
      continue;
    }

    if (value === null) {
      entries.push({ name, value: "" });
      continue;
    }

    const objectReference = asObject(value);
    const objectId = readNumber(objectReference?.id);
    if (objectReference && objectId !== undefined) {
      entries.push({ name, type: "object", value: objectId });
      continue;
    }

    throw new Error(`Unsupported Tiled Lua property '${name}'.`);
  }

  return entries.length > 0 ? entries : undefined;
}

function normalizeLuaPoints(pointsValue: unknown) {
  return asArray(pointsValue).map((pointValue) => {
    const point = asObject(pointValue) ?? {};
    return {
      x: readNumber(point.x) ?? 0,
      y: readNumber(point.y) ?? 0,
    };
  });
}

function normalizeLuaObject(objectValue: unknown): TiledJsonObject {
  const object = asObject(objectValue);
  if (!object) {
    throw new Error("Invalid Tiled Lua object entry.");
  }

  const shape = readString(object.shape) ?? "rectangle";
  const normalized: TiledJsonObject = {
    ...(readNumber(object.id) !== undefined
      ? { id: readNumber(object.id) }
      : {}),
    ...(readString(object.name) ? { name: readString(object.name) } : {}),
    ...(readNumber(object.x) !== undefined ? { x: readNumber(object.x) } : {}),
    ...(readNumber(object.y) !== undefined ? { y: readNumber(object.y) } : {}),
    ...(readNumber(object.width) !== undefined
      ? { width: readNumber(object.width) }
      : {}),
    ...(readNumber(object.height) !== undefined
      ? { height: readNumber(object.height) }
      : {}),
    ...(readNumber(object.rotation) !== undefined
      ? { rotation: readNumber(object.rotation) }
      : {}),
    ...(readBoolean(object.visible) !== undefined
      ? { visible: readBoolean(object.visible) }
      : {}),
    ...(readNumber(object.gid) !== undefined
      ? { gid: readNumber(object.gid) }
      : {}),
    ...(convertLuaPropertiesToJson(object.properties)
      ? { properties: convertLuaPropertiesToJson(object.properties) }
      : {}),
  };

  if (shape === "ellipse") {
    normalized.ellipse = true;
  } else if (shape === "point") {
    normalized.point = true;
  } else if (shape === "polygon") {
    normalized.polygon = normalizeLuaPoints(object.polygon);
  } else if (shape === "polyline") {
    normalized.polyline = normalizeLuaPoints(object.polyline);
  } else if (shape === "text") {
    normalized.text = {
      text: readString(object.text) ?? "",
      ...(readString(object.fontfamily)
        ? { fontfamily: readString(object.fontfamily) }
        : {}),
      ...(readNumber(object.pixelsize) !== undefined
        ? { pixelsize: readNumber(object.pixelsize) }
        : {}),
      ...(readBoolean(object.wrap) !== undefined
        ? { wrap: readBoolean(object.wrap) }
        : {}),
      ...(readString(object.color) ? { color: readString(object.color) } : {}),
    };
  }

  return normalized;
}

function normalizeLuaLayer(layerValue: unknown): TiledJsonLayer {
  const layer = asObject(layerValue);
  if (!layer) {
    throw new Error("Invalid Tiled Lua layer entry.");
  }

  const type = readString(layer.type);
  if (!type) {
    throw new Error("Tiled Lua layer is missing a type.");
  }

  const sharedFields = {
    ...(readNumber(layer.id) !== undefined ? { id: readNumber(layer.id) } : {}),
    ...(readString(layer.name) ? { name: readString(layer.name) } : {}),
    ...(readBoolean(layer.visible) !== undefined
      ? { visible: readBoolean(layer.visible) }
      : {}),
    ...(readNumber(layer.opacity) !== undefined
      ? { opacity: readNumber(layer.opacity) }
      : {}),
    ...(readNumber(layer.offsetx) !== undefined
      ? { offsetx: readNumber(layer.offsetx) }
      : {}),
    ...(readNumber(layer.offsety) !== undefined
      ? { offsety: readNumber(layer.offsety) }
      : {}),
    ...(readNumber(layer.x) !== undefined ? { x: readNumber(layer.x) } : {}),
    ...(readNumber(layer.y) !== undefined ? { y: readNumber(layer.y) } : {}),
    ...(convertLuaPropertiesToJson(layer.properties)
      ? { properties: convertLuaPropertiesToJson(layer.properties) }
      : {}),
  };

  if (type === "tilelayer") {
    const data = layer.data;
    return {
      type: "tilelayer",
      ...sharedFields,
      ...(readNumber(layer.width) !== undefined
        ? { width: readNumber(layer.width) }
        : {}),
      ...(readNumber(layer.height) !== undefined
        ? { height: readNumber(layer.height) }
        : {}),
      ...(Array.isArray(data)
        ? { data: data.map((value) => Number(value) || 0) }
        : typeof data === "string"
          ? {
              data,
              ...(readLayerEncoding(layer.encoding)
                ? { encoding: readLayerEncoding(layer.encoding) }
                : {}),
              ...(readLayerCompression(layer.compression)
                ? { compression: readLayerCompression(layer.compression) }
                : {}),
            }
          : {}),
    };
  }

  if (type === "imagelayer") {
    return {
      type: "imagelayer",
      ...sharedFields,
      ...(readString(layer.image) ? { image: readString(layer.image) } : {}),
    };
  }

  if (type === "objectgroup") {
    return {
      type: "objectgroup",
      ...sharedFields,
      objects: asArray(layer.objects).map((object) =>
        normalizeLuaObject(object),
      ),
    };
  }

  if (type === "group") {
    return {
      type: "group",
      ...sharedFields,
      layers: asArray(layer.layers).map((child) => normalizeLuaLayer(child)),
    };
  }

  throw new Error(`Unsupported Tiled Lua layer type: ${type}.`);
}

function normalizeLuaTilesetBody(
  tileset: Record<string, unknown>,
  includeFirstGid: boolean,
): TiledJsonTileset {
  return {
    ...(includeFirstGid && readNumber(tileset.firstgid) !== undefined
      ? { firstgid: readNumber(tileset.firstgid) }
      : {}),
    ...(readString(tileset.version) || readNumber(tileset.version) !== undefined
      ? { version: readString(tileset.version) ?? readNumber(tileset.version) }
      : {}),
    ...(readString(tileset.tiledversion)
      ? { tiledversion: readString(tileset.tiledversion) }
      : {}),
    ...(readString(tileset.name) ? { name: readString(tileset.name) } : {}),
    ...(readNumber(tileset.tilewidth) !== undefined
      ? { tilewidth: readNumber(tileset.tilewidth) }
      : {}),
    ...(readNumber(tileset.tileheight) !== undefined
      ? { tileheight: readNumber(tileset.tileheight) }
      : {}),
    ...(readNumber(tileset.tilecount) !== undefined
      ? { tilecount: readNumber(tileset.tilecount) }
      : {}),
    ...(readNumber(tileset.columns) !== undefined
      ? { columns: readNumber(tileset.columns) }
      : {}),
    ...(readNumber(tileset.margin) !== undefined
      ? { margin: readNumber(tileset.margin) }
      : {}),
    ...(readNumber(tileset.spacing) !== undefined
      ? { spacing: readNumber(tileset.spacing) }
      : {}),
    ...(readString(tileset.image) ? { image: readString(tileset.image) } : {}),
    ...(readNumber(tileset.imagewidth) !== undefined
      ? { imagewidth: readNumber(tileset.imagewidth) }
      : {}),
    ...(readNumber(tileset.imageheight) !== undefined
      ? { imageheight: readNumber(tileset.imageheight) }
      : {}),
    ...(convertLuaPropertiesToJson(tileset.properties)
      ? { properties: convertLuaPropertiesToJson(tileset.properties) }
      : {}),
  };
}

function normalizeLuaMapTileset(tilesetValue: unknown): TiledJsonTileset {
  const tileset = asObject(tilesetValue);
  if (!tileset) {
    throw new Error("Invalid Tiled Lua tileset entry.");
  }

  const source =
    readString(tileset.exportfilename) ?? readString(tileset.filename);
  if (source) {
    return {
      ...(readNumber(tileset.firstgid) !== undefined
        ? { firstgid: readNumber(tileset.firstgid) }
        : {}),
      source,
    };
  }

  return normalizeLuaTilesetBody(tileset, true);
}

function convertJsonPropertiesToLua(
  properties: readonly TiledJsonProperty[] | undefined,
) {
  if (!properties || properties.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    properties.flatMap((property) => {
      if (!property.name) {
        return [];
      }

      if (property.type === "object") {
        return [[property.name, { id: Number(property.value ?? 0) }]];
      }

      return [[property.name, property.value ?? ""]];
    }),
  );
}

function buildTiledLuaObject(object: TiledJsonObject) {
  const shape = object.text
    ? "text"
    : object.ellipse
      ? "ellipse"
      : object.point
        ? "point"
        : object.polyline
          ? "polyline"
          : object.polygon
            ? "polygon"
            : "rectangle";
  const normalized = {
    ...(object.id !== undefined ? { id: object.id } : {}),
    ...(object.name ? { name: object.name } : {}),
    ...(object.x !== undefined ? { x: object.x } : {}),
    ...(object.y !== undefined ? { y: object.y } : {}),
    ...(object.width !== undefined ? { width: object.width } : {}),
    ...(object.height !== undefined ? { height: object.height } : {}),
    ...(object.rotation !== undefined ? { rotation: object.rotation } : {}),
    ...(object.visible !== undefined ? { visible: object.visible } : {}),
    ...(object.gid !== undefined ? { gid: object.gid } : {}),
    shape,
    ...(convertJsonPropertiesToLua(object.properties)
      ? { properties: convertJsonPropertiesToLua(object.properties) }
      : {}),
  } as Record<string, unknown>;

  if (shape === "polygon") {
    normalized.polygon = (object.polygon ?? []).map((point) => ({
      x: point.x ?? 0,
      y: point.y ?? 0,
    }));
  } else if (shape === "polyline") {
    normalized.polyline = (object.polyline ?? []).map((point) => ({
      x: point.x ?? 0,
      y: point.y ?? 0,
    }));
  } else if (shape === "text") {
    normalized.text = object.text?.text ?? "";
    if (object.text?.fontfamily) {
      normalized.fontfamily = object.text.fontfamily;
    }
    if (object.text?.pixelsize !== undefined) {
      normalized.pixelsize = object.text.pixelsize;
    }
    if (object.text?.wrap !== undefined) {
      normalized.wrap = object.text.wrap;
    }
    if (object.text?.color) {
      normalized.color = object.text.color;
    }
  }

  return normalized;
}

function isJsonGroupLayer(layer: TiledJsonLayer): layer is TiledJsonGroupLayer {
  return layer.type === "group";
}

function isJsonImageLayer(layer: TiledJsonLayer): layer is TiledJsonImageLayer {
  return layer.type === "imagelayer";
}

function isJsonObjectLayer(
  layer: TiledJsonLayer,
): layer is TiledJsonObjectLayer {
  return layer.type === "objectgroup";
}

function isJsonTileLayer(layer: TiledJsonLayer): layer is TiledJsonTileLayer {
  return layer.type === "tilelayer";
}

function buildTiledLuaLayer(layer: TiledJsonLayer): Record<string, unknown> {
  const shared = {
    ...(layer.id !== undefined ? { id: layer.id } : {}),
    ...(layer.name ? { name: layer.name } : {}),
    ...(layer.visible !== undefined ? { visible: layer.visible } : {}),
    ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
    ...(layer.x !== undefined ? { x: layer.x } : {}),
    ...(layer.y !== undefined ? { y: layer.y } : {}),
    ...(layer.offsetx !== undefined ? { offsetx: layer.offsetx } : {}),
    ...(layer.offsety !== undefined ? { offsety: layer.offsety } : {}),
    ...(convertJsonPropertiesToLua(layer.properties)
      ? { properties: convertJsonPropertiesToLua(layer.properties) }
      : {}),
  };

  if (isJsonGroupLayer(layer)) {
    return {
      type: "group",
      ...shared,
      layers: (layer.layers ?? []).map((child) => buildTiledLuaLayer(child)),
    };
  }

  if (isJsonImageLayer(layer)) {
    return {
      type: "imagelayer",
      ...shared,
      ...(layer.image ? { image: layer.image } : {}),
    };
  }

  if (isJsonObjectLayer(layer)) {
    return {
      type: "objectgroup",
      ...shared,
      objects: (layer.objects ?? []).map((object) =>
        buildTiledLuaObject(object),
      ),
    };
  }

  if (!isJsonTileLayer(layer)) {
    throw new Error("Unsupported Tiled JSON layer type.");
  }

  return {
    type: "tilelayer",
    ...shared,
    ...(layer.width !== undefined ? { width: layer.width } : {}),
    ...(layer.height !== undefined ? { height: layer.height } : {}),
    ...(Array.isArray(layer.data)
      ? { data: layer.data, encoding: "lua" }
      : {
          data: layer.data,
          ...(layer.encoding ? { encoding: layer.encoding } : {}),
          ...(layer.compression ? { compression: layer.compression } : {}),
        }),
  };
}

function buildEmbeddedTiledLuaTileset(tileset: TiledJsonTileset) {
  return {
    ...(tileset.firstgid !== undefined ? { firstgid: tileset.firstgid } : {}),
    ...(tileset.name ? { name: tileset.name } : {}),
    ...(tileset.tilewidth !== undefined
      ? { tilewidth: tileset.tilewidth }
      : {}),
    ...(tileset.tileheight !== undefined
      ? { tileheight: tileset.tileheight }
      : {}),
    ...(tileset.tilecount !== undefined
      ? { tilecount: tileset.tilecount }
      : {}),
    ...(tileset.columns !== undefined ? { columns: tileset.columns } : {}),
    ...(tileset.margin !== undefined ? { margin: tileset.margin } : {}),
    ...(tileset.spacing !== undefined ? { spacing: tileset.spacing } : {}),
    ...(tileset.image ? { image: tileset.image } : {}),
    ...(tileset.imagewidth !== undefined
      ? { imagewidth: tileset.imagewidth }
      : {}),
    ...(tileset.imageheight !== undefined
      ? { imageheight: tileset.imageheight }
      : {}),
    ...(convertJsonPropertiesToLua(tileset.properties)
      ? { properties: convertJsonPropertiesToLua(tileset.properties) }
      : {}),
  };
}

export function normalizeTiledLuaMapDocument(
  document: Record<string, unknown>,
): TiledJsonMap {
  return {
    type: "map",
    version:
      readString(document.version) ??
      readNumber(document.version) ??
      TILED_FORMAT_VERSION,
    tiledversion: readString(document.tiledversion) ?? TILED_FORMAT_VERSION,
    orientation: readString(document.orientation),
    renderorder: readString(document.renderorder),
    ...(readNumber(document.width) !== undefined
      ? { width: readNumber(document.width) }
      : {}),
    ...(readNumber(document.height) !== undefined
      ? { height: readNumber(document.height) }
      : {}),
    ...(readNumber(document.tilewidth) !== undefined
      ? { tilewidth: readNumber(document.tilewidth) }
      : {}),
    ...(readNumber(document.tileheight) !== undefined
      ? { tileheight: readNumber(document.tileheight) }
      : {}),
    ...(readBoolean(document.infinite) !== undefined
      ? { infinite: readBoolean(document.infinite) }
      : {}),
    ...(readNumber(document.compressionlevel) !== undefined
      ? { compressionlevel: readNumber(document.compressionlevel) }
      : {}),
    ...(readString(document.staggeraxis)
      ? { staggeraxis: readString(document.staggeraxis) }
      : {}),
    ...(readString(document.staggerindex)
      ? { staggerindex: readString(document.staggerindex) }
      : {}),
    ...(readNumber(document.hexsidelength) !== undefined
      ? { hexsidelength: readNumber(document.hexsidelength) }
      : {}),
    ...(readNumber(document.nextlayerid) !== undefined
      ? { nextlayerid: readNumber(document.nextlayerid) }
      : {}),
    ...(readNumber(document.nextobjectid) !== undefined
      ? { nextobjectid: readNumber(document.nextobjectid) }
      : {}),
    ...(convertLuaPropertiesToJson(document.properties)
      ? { properties: convertLuaPropertiesToJson(document.properties) }
      : {}),
    layers: asArray(document.layers).map((layer) => normalizeLuaLayer(layer)),
    tilesets: asArray(document.tilesets).map((tileset) =>
      normalizeLuaMapTileset(tileset),
    ),
  };
}

export function normalizeTiledLuaTilesetDocument(
  document: Record<string, unknown>,
): TiledJsonTileset {
  return normalizeLuaTilesetBody(document, false);
}

export function createSyntheticTiledLuaJsonEntries(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
) {
  const normalizedRootPath = normalizeBundlePath(rootPath);

  return entries.map((entry) => {
    const normalizedPath = normalizeBundlePath(entry.path);
    if (!normalizedPath.toLowerCase().endsWith(".lua")) {
      return {
        path: normalizedPath,
        data: entry.data,
      };
    }

    const parsed = parseTiledLuaDocument<Record<string, unknown>>(
      entry.data,
      normalizedPath === normalizedRootPath
        ? "Tiled Lua map"
        : "Tiled Lua tileset",
    );
    const normalizedDocument =
      normalizedPath === normalizedRootPath
        ? normalizeTiledLuaMapDocument(parsed)
        : normalizeTiledLuaTilesetDocument(parsed);

    return {
      path: normalizedPath,
      data: encodeJsonDocument(normalizedDocument),
    };
  });
}

export function buildTiledLuaMapDocument(rootDocument: TiledJsonMap) {
  return {
    version: rootDocument.version ?? TILED_FORMAT_VERSION,
    luaversion: "5.1",
    tiledversion: rootDocument.tiledversion ?? TILED_FORMAT_VERSION,
    ...(rootDocument.orientation
      ? { orientation: rootDocument.orientation }
      : {}),
    ...(rootDocument.renderorder
      ? { renderorder: rootDocument.renderorder }
      : {}),
    ...(rootDocument.width !== undefined ? { width: rootDocument.width } : {}),
    ...(rootDocument.height !== undefined
      ? { height: rootDocument.height }
      : {}),
    ...(rootDocument.tilewidth !== undefined
      ? { tilewidth: rootDocument.tilewidth }
      : {}),
    ...(rootDocument.tileheight !== undefined
      ? { tileheight: rootDocument.tileheight }
      : {}),
    ...(rootDocument.infinite ? { infinite: true } : {}),
    ...(rootDocument.compressionlevel !== undefined
      ? { compressionlevel: rootDocument.compressionlevel }
      : {}),
    ...(rootDocument.staggeraxis
      ? { staggeraxis: rootDocument.staggeraxis }
      : {}),
    ...(rootDocument.staggerindex
      ? { staggerindex: rootDocument.staggerindex }
      : {}),
    ...(rootDocument.hexsidelength !== undefined
      ? { hexsidelength: rootDocument.hexsidelength }
      : {}),
    ...(rootDocument.nextlayerid !== undefined
      ? { nextlayerid: rootDocument.nextlayerid }
      : {}),
    ...(rootDocument.nextobjectid !== undefined
      ? { nextobjectid: rootDocument.nextobjectid }
      : {}),
    ...(convertJsonPropertiesToLua(rootDocument.properties)
      ? { properties: convertJsonPropertiesToLua(rootDocument.properties) }
      : {}),
    layers: (rootDocument.layers ?? []).map((layer) =>
      buildTiledLuaLayer(layer),
    ),
    tilesets: (rootDocument.tilesets ?? []).map((tileset) =>
      tileset.source
        ? {
            ...(tileset.firstgid !== undefined
              ? { firstgid: tileset.firstgid }
              : {}),
            filename: tileset.source,
          }
        : buildEmbeddedTiledLuaTileset(tileset),
    ),
  };
}

export function buildTiledLuaTilesetDocument(tileset: TiledJsonTileset) {
  return {
    version: tileset.version ?? TILED_FORMAT_VERSION,
    luaversion: "5.1",
    tiledversion: tileset.tiledversion ?? TILED_FORMAT_VERSION,
    ...buildEmbeddedTiledLuaTileset(tileset),
  };
}
