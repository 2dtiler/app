import { assert, test } from "vitest";
import { db } from "@/services/db";
import {
  exportMappyMap,
  importMappyMap,
} from "@/features/import-export/lib/import-export-mappy";
import {
  generateAssetId,
  generateLayerId,
  generateMapId,
  generateTilesetId,
} from "@/utils/ids";
import type { TileLayer, TileMapData, Tileset } from "@/types";

const BLOCK_STRUCTURE_SIZE = 32;

interface MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface MockImageLike {
  naturalWidth: number;
  naturalHeight: number;
  pixelData: Uint8ClampedArray;
  src: string;
  decode(): Promise<void>;
}

class MockCanvasRenderingContext2D {
  imageSmoothingEnabled = false;
  private readonly pixelData: Uint8ClampedArray;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.pixelData = new Uint8ClampedArray(width * height * 4);
  }

  createImageData(width: number, height: number): MockImageData {
    return {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    };
  }

  putImageData(imageData: MockImageData, dx: number, dy: number) {
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const sourceOffset = (y * imageData.width + x) * 4;
        const targetOffset = ((dy + y) * this.width + (dx + x)) * 4;
        this.pixelData[targetOffset] = imageData.data[sourceOffset] ?? 0;
        this.pixelData[targetOffset + 1] =
          imageData.data[sourceOffset + 1] ?? 0;
        this.pixelData[targetOffset + 2] =
          imageData.data[sourceOffset + 2] ?? 0;
        this.pixelData[targetOffset + 3] =
          imageData.data[sourceOffset + 3] ?? 0;
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): MockImageData {
    const data = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const sourceOffset = ((sy + y) * this.width + (sx + x)) * 4;
        const targetOffset = (y * sw + x) * 4;
        data[targetOffset] = this.pixelData[sourceOffset] ?? 0;
        data[targetOffset + 1] = this.pixelData[sourceOffset + 1] ?? 0;
        data[targetOffset + 2] = this.pixelData[sourceOffset + 2] ?? 0;
        data[targetOffset + 3] = this.pixelData[sourceOffset + 3] ?? 0;
      }
    }
    return { data, width: sw, height: sh };
  }

  drawImage(
    image: MockImageLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    assert.strictEqual(sw, dw);
    assert.strictEqual(sh, dh);
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const sourceOffset = ((sy + y) * image.naturalWidth + (sx + x)) * 4;
        const targetOffset = ((dy + y) * this.width + (dx + x)) * 4;
        this.pixelData[targetOffset] = image.pixelData[sourceOffset] ?? 0;
        this.pixelData[targetOffset + 1] =
          image.pixelData[sourceOffset + 1] ?? 0;
        this.pixelData[targetOffset + 2] =
          image.pixelData[sourceOffset + 2] ?? 0;
        this.pixelData[targetOffset + 3] =
          image.pixelData[sourceOffset + 3] ?? 0;
      }
    }
  }

  exportBytes() {
    return this.pixelData.slice();
  }
}

class MockCanvasElement {
  width = 0;
  height = 0;
  private context: MockCanvasRenderingContext2D | null = null;

  getContext(type: string) {
    if (type !== "2d") {
      return null;
    }

    if (!this.context) {
      this.context = new MockCanvasRenderingContext2D(this.width, this.height);
    }

    return this.context;
  }

  toBlob(callback: (blob: Blob | null) => void, type = "image/png") {
    const context = this.getContext("2d");
    if (!context) {
      callback(null);
      return;
    }

    callback(
      new Blob(
        [encodeMockImage(this.width, this.height, context.exportBytes())],
        {
          type,
        },
      ),
    );
  }
}

function encodeMockImage(
  width: number,
  height: number,
  pixelData: Uint8ClampedArray,
) {
  const bytes = new Uint8Array(8 + pixelData.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  bytes.set(pixelData, 8);
  return bytes;
}

async function decodeMockImage(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  return {
    width,
    height,
    pixelData: new Uint8ClampedArray(bytes.slice(8).buffer),
  };
}

function writeFourCC(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < 4; index += 1) {
    target[offset + index] = value.charCodeAt(index) ?? 0;
  }
}

function writeUint32BE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer).setUint32(offset, value, false);
}

function writeInt32LE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer).setInt32(offset, value, true);
}

function writeInt16LE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer).setInt16(offset, value, true);
}

function buildChunk(id: string, data: Uint8Array) {
  const padding = data.byteLength % 2;
  const chunk = new Uint8Array(8 + data.byteLength + padding);
  writeFourCC(chunk, 0, id);
  writeUint32BE(chunk, 4, data.byteLength);
  chunk.set(data, 8);
  return chunk;
}

function encodeMappyFile(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(12 + size);
  writeFourCC(bytes, 0, "FORM");
  writeUint32BE(bytes, 4, 4 + size);
  writeFourCC(bytes, 8, "FMAP");
  let offset = 12;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function buildFixtureFmp() {
  const tileSize = 16;
  const bytesPerGraphic = tileSize * tileSize * 3;
  const mphd = new Uint8Array(24);
  mphd[0] = 1;
  mphd[1] = 0;
  mphd[2] = 1;
  writeInt16LE(mphd, 4, 2);
  writeInt16LE(mphd, 6, 2);
  writeInt16LE(mphd, 12, tileSize);
  writeInt16LE(mphd, 14, tileSize);
  writeInt16LE(mphd, 16, 24);
  writeInt16LE(mphd, 18, BLOCK_STRUCTURE_SIZE);
  writeInt16LE(mphd, 20, 3);
  writeInt16LE(mphd, 22, 3);

  const bkdt = new Uint8Array(3 * BLOCK_STRUCTURE_SIZE);
  writeInt32LE(bkdt, BLOCK_STRUCTURE_SIZE, bytesPerGraphic);
  writeInt32LE(bkdt, BLOCK_STRUCTURE_SIZE * 2, bytesPerGraphic * 2);

  const bgfx = new Uint8Array(3 * bytesPerGraphic);
  for (let index = bytesPerGraphic; index < bytesPerGraphic * 2; index += 3) {
    bgfx[index] = 255;
  }
  for (let index = bytesPerGraphic * 2; index < bgfx.byteLength; index += 3) {
    bgfx[index + 1] = 255;
  }

  const body = new Uint8Array(8);
  writeInt16LE(body, 0, BLOCK_STRUCTURE_SIZE);
  writeInt16LE(body, 2, 0);
  writeInt16LE(body, 4, BLOCK_STRUCTURE_SIZE * 2);
  writeInt16LE(body, 6, BLOCK_STRUCTURE_SIZE);

  const lyr1 = new Uint8Array(8);
  writeInt16LE(lyr1, 0, 0);
  writeInt16LE(lyr1, 2, BLOCK_STRUCTURE_SIZE * 2);
  writeInt16LE(lyr1, 4, 0);
  writeInt16LE(lyr1, 6, 0);

  return encodeMappyFile([
    buildChunk("MPHD", mphd),
    buildChunk("CMAP", new Uint8Array(256 * 3)),
    buildChunk("BKDT", bkdt),
    buildChunk("BGFX", bgfx),
    buildChunk("LYR1", lyr1),
    buildChunk("BODY", body),
  ]);
}

function parseChunkIds(bytes: Uint8Array) {
  const ids: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 0,
      bytes[offset + 3] ?? 0,
    );
    ids.push(id);
    const size = view.getUint32(offset + 4, false);
    offset += 8 + size + (size % 2);
  }
  return ids;
}

async function withMockGraphicsEnvironment(run: () => Promise<void>) {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
  const objectUrlStore = new Map<string, Blob>();
  let objectUrlIndex = 0;

  class MockImage implements MockImageLike {
    naturalWidth = 0;
    naturalHeight = 0;
    pixelData = new Uint8ClampedArray();
    src = "";

    async decode() {
      const blob = objectUrlStore.get(this.src);
      if (!blob) {
        throw new Error(`Unknown mock object URL: ${this.src}`);
      }
      const decoded = await decodeMockImage(blob);
      this.naturalWidth = decoded.width;
      this.naturalHeight = decoded.height;
      this.pixelData = decoded.pixelData;
    }
  }

  Object.assign(globalThis, {
    document: {
      createElement(tagName: string) {
        if (tagName !== "canvas") {
          throw new Error(`Unsupported element: ${tagName}`);
        }
        return new MockCanvasElement();
      },
    },
    Image: MockImage as unknown as typeof Image,
  });

  globalThis.URL.createObjectURL = ((blob: Blob) => {
    const url = `mock-url:${objectUrlIndex++}`;
    objectUrlStore.set(url, blob);
    return url;
  }) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ((url: string) => {
    objectUrlStore.delete(url);
  }) as typeof URL.revokeObjectURL;

  try {
    await run();
  } finally {
    if (originalDocument) {
      Object.assign(globalThis, { document: originalDocument });
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }

    if (originalImage) {
      Object.assign(globalThis, { Image: originalImage });
    } else {
      Reflect.deleteProperty(globalThis, "Image");
    }

    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

test("importMappyMap imports static BODY and LYR layers", async () => {
  await withMockGraphicsEnvironment(async () => {
    const originalPut = db.assets.put;
    db.assets.put = (async () => undefined) as typeof db.assets.put;

    try {
      const result = await importMappyMap("level.fmp", buildFixtureFmp());

      assert.strictEqual(result.map.name, "level");
      assert.strictEqual(result.map.widthInTiles, 2);
      assert.strictEqual(result.layers.length, 2);
      assert.strictEqual(result.tilesets.length, 1);
      assert.deepEqual(Object.keys(result.layers[0]?.tiles ?? {}).sort(), [
        "0,0",
        "0,1",
        "1,1",
      ]);
      assert.deepEqual(Object.keys(result.layers[1]?.tiles ?? {}).sort(), [
        "1,0",
      ]);
      assert.strictEqual(result.layers[0]?.tiles["0,0"]?.sx, 0);
      assert.strictEqual(result.layers[0]?.tiles["0,1"]?.sx, 16);
      assert.strictEqual(result.layers[1]?.tiles["1,0"]?.sx, 16);
    } finally {
      db.assets.put = originalPut;
    }
  });
});

test("exportMappyMap emits the expected Mappy chunk surface", async () => {
  await withMockGraphicsEnvironment(async () => {
    const originalGet = db.assets.get;
    const assetId = generateAssetId();
    const tilesetPixels = new Uint8ClampedArray(32 * 16 * 4);

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const offset = (y * 32 + x) * 4;
        tilesetPixels[offset] = 255;
        tilesetPixels[offset + 3] = 255;
      }
      for (let x = 16; x < 32; x += 1) {
        const offset = (y * 32 + x) * 4;
        tilesetPixels[offset + 1] = 255;
        tilesetPixels[offset + 3] = 255;
      }
    }

    db.assets.get = (async () => ({
      id: assetId,
      data: encodeMockImage(32, 16, tilesetPixels).buffer,
      mimeType: "image/mock",
      createdAt: Date.now(),
    })) as typeof db.assets.get;

    try {
      const tileset: Tileset = {
        id: generateTilesetId(),
        name: "terrain",
        groupId: "group" as Tileset["groupId"],
        tileSize: 16,
        assetId,
        imageWidth: 32,
        imageHeight: 16,
        createdAt: Date.now(),
      };
      const map: TileMapData = {
        id: generateMapId(),
        name: "level",
        groupId: "group" as TileMapData["groupId"],
        orientation: "orthogonal",
        widthInTiles: 2,
        heightInTiles: 2,
        tileSize: 16,
        properties: {},
        layerOrder: [],
        createdAt: Date.now(),
      };
      const baseLayerId = generateLayerId();
      const detailLayerId = generateLayerId();
      map.layerOrder = [baseLayerId, detailLayerId];

      const baseLayer: TileLayer = {
        id: baseLayerId,
        mapId: map.id,
        name: "Base",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {
          "0,0": {
            tilesetId: tileset.id,
            sx: 0,
            sy: 0,
            sw: 16,
            sh: 16,
          },
          "1,1": {
            tilesetId: tileset.id,
            sx: 16,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      };
      const detailLayer: TileLayer = {
        id: detailLayerId,
        mapId: map.id,
        name: "Detail",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {
          "1,0": {
            tilesetId: tileset.id,
            sx: 16,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      };

      const bytes = await exportMappyMap(
        map,
        [baseLayer, detailLayer],
        [tileset],
        [],
        [],
        [],
        [],
      );

      assert.strictEqual(String.fromCharCode(...bytes.slice(0, 4)), "FORM");
      assert.strictEqual(String.fromCharCode(...bytes.slice(8, 12)), "FMAP");
      assert.deepEqual(parseChunkIds(bytes), [
        "MPHD",
        "CMAP",
        "BKDT",
        "BGFX",
        "LYR1",
        "BODY",
      ]);
    } finally {
      db.assets.get = originalGet;
    }
  });
});

test("exportMappyMap round-trips static tile placements through importMappyMap", async () => {
  await withMockGraphicsEnvironment(async () => {
    const originalGet = db.assets.get;
    const originalPut = db.assets.put;
    const assetId = generateAssetId();
    const tilesetPixels = new Uint8ClampedArray(32 * 16 * 4);

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const offset = (y * 32 + x) * 4;
        tilesetPixels[offset] = 255;
        tilesetPixels[offset + 3] = 255;
      }
      for (let x = 16; x < 32; x += 1) {
        const offset = (y * 32 + x) * 4;
        tilesetPixels[offset + 1] = 255;
        tilesetPixels[offset + 3] = 255;
      }
    }

    db.assets.get = (async () => ({
      id: assetId,
      data: encodeMockImage(32, 16, tilesetPixels).buffer,
      mimeType: "image/mock",
      createdAt: Date.now(),
    })) as typeof db.assets.get;
    db.assets.put = (async () => undefined) as typeof db.assets.put;

    try {
      const tileset: Tileset = {
        id: generateTilesetId(),
        name: "terrain",
        groupId: "group" as Tileset["groupId"],
        tileSize: 16,
        assetId,
        imageWidth: 32,
        imageHeight: 16,
        createdAt: Date.now(),
      };
      const map: TileMapData = {
        id: generateMapId(),
        name: "level",
        groupId: "group" as TileMapData["groupId"],
        orientation: "orthogonal",
        widthInTiles: 2,
        heightInTiles: 2,
        tileSize: 16,
        properties: {},
        layerOrder: [],
        createdAt: Date.now(),
      };
      const baseLayerId = generateLayerId();
      const detailLayerId = generateLayerId();
      map.layerOrder = [baseLayerId, detailLayerId];

      const baseLayer: TileLayer = {
        id: baseLayerId,
        mapId: map.id,
        name: "Base",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {
          "0,0": {
            tilesetId: tileset.id,
            sx: 0,
            sy: 0,
            sw: 16,
            sh: 16,
          },
          "1,1": {
            tilesetId: tileset.id,
            sx: 16,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      };
      const detailLayer: TileLayer = {
        id: detailLayerId,
        mapId: map.id,
        name: "Detail",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {
          "1,0": {
            tilesetId: tileset.id,
            sx: 16,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      };

      const exported = await exportMappyMap(
        map,
        [baseLayer, detailLayer],
        [tileset],
        [],
        [],
        [],
        [],
      );
      const imported = await importMappyMap("roundtrip.fmp", exported);

      assert.strictEqual(imported.layers.length, 2);
      assert.deepEqual(Object.keys(imported.layers[0]?.tiles ?? {}).sort(), [
        "0,0",
        "1,1",
      ]);
      assert.deepEqual(Object.keys(imported.layers[1]?.tiles ?? {}).sort(), [
        "1,0",
      ]);
      assert.strictEqual(imported.layers[0]?.tiles["1,1"]?.sx, 16);
      assert.strictEqual(imported.map.tileSize, 16);
    } finally {
      db.assets.get = originalGet;
      db.assets.put = originalPut;
    }
  });
});
