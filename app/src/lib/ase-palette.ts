/**
 * ASE (Aseprite) palette file format parser and writer.
 *
 * Supports reading both old palette chunks (0x0004 / 0x0011) and the
 * new palette chunk (0x2019). Writes only the new palette chunk format.
 *
 * Reference: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 */

import type { Color } from "@/types/image-editor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;
const CHUNK_OLD_PALETTE_04 = 0x0004;
const CHUNK_OLD_PALETTE_11 = 0x0011;
const CHUNK_NEW_PALETTE = 0x2019;

// ---------------------------------------------------------------------------
// Read helpers (little-endian)
// ---------------------------------------------------------------------------

function readU8(view: DataView, offset: number): number {
  return view.getUint8(offset);
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

// ---------------------------------------------------------------------------
// Write helpers (little-endian)
// ---------------------------------------------------------------------------

function writeU8(view: DataView, offset: number, val: number) {
  view.setUint8(offset, val);
}

function writeU16(view: DataView, offset: number, val: number) {
  view.setUint16(offset, val, true);
}

function writeU32(view: DataView, offset: number, val: number) {
  view.setUint32(offset, val, true);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an Aseprite (.ase / .aseprite) file and extract the color palette.
 * Returns the palette colors as an array of RGBA Color objects.
 */
export function parseAsePalette(buffer: ArrayBuffer): Color[] {
  const view = new DataView(buffer);

  // Validate header magic
  const magic = readU16(view, 4);
  if (magic !== ASE_MAGIC) {
    throw new Error("Not a valid Aseprite file (bad magic number)");
  }

  const numFrames = readU16(view, 6);
  readU16(view, 8); // width (skip)
  readU16(view, 10); // height (skip)

  let colors: Color[] = [];
  let offset = 128; // Skip the 128-byte header

  // Iterate through frames
  for (let frame = 0; frame < numFrames; frame++) {
    if (offset + 16 > buffer.byteLength) break;

    const frameSize = readU32(view, offset);
    const frameMagic = readU16(view, offset + 4);
    if (frameMagic !== FRAME_MAGIC) break;

    // Old format: number of chunks is in bytes 6-7 (old field) and optionally
    // the new field at bytes 12-15. Use the new field if non-zero.
    const oldNumChunks = readU16(view, offset + 6);
    const newNumChunks = readU32(view, offset + 12);
    const numChunks = newNumChunks !== 0 ? newNumChunks : oldNumChunks;

    let chunkOffset = offset + 16; // Skip frame header

    for (let chunk = 0; chunk < numChunks; chunk++) {
      if (chunkOffset + 6 > buffer.byteLength) break;

      const chunkSize = readU32(view, chunkOffset);
      const chunkType = readU16(view, chunkOffset + 4);

      if (chunkType === CHUNK_NEW_PALETTE) {
        // New palette chunk (0x2019) — preferred
        colors = parseNewPaletteChunk(view, chunkOffset);
      } else if (
        (chunkType === CHUNK_OLD_PALETTE_04 ||
          chunkType === CHUNK_OLD_PALETTE_11) &&
        colors.length === 0
      ) {
        // Old palette chunk — only use if we haven't found a new palette chunk
        colors = parseOldPaletteChunk04(view, chunkOffset);
      }

      chunkOffset += chunkSize;
    }

    offset += frameSize;

    // We only need the palette from the first frame
    if (colors.length > 0) break;
  }

  return colors;
}

function parseNewPaletteChunk(view: DataView, chunkOffset: number): Color[] {
  const colors: Color[] = [];

  // Chunk header: 4 bytes size, 2 bytes type = 6 bytes
  let off = chunkOffset + 6;

  readU32(view, off); // paletteSize (skip)
  off += 4;
  const firstColorIndex = readU32(view, off);
  off += 4;
  const lastColorIndex = readU32(view, off);
  off += 4;
  off += 8; // Reserved

  // Read entries from firstColorIndex to lastColorIndex
  const count = lastColorIndex - firstColorIndex + 1;
  for (let i = 0; i < count; i++) {
    const flags = readU16(view, off);
    off += 2;
    const r = readU8(view, off);
    off += 1;
    const g = readU8(view, off);
    off += 1;
    const b = readU8(view, off);
    off += 1;
    const a = readU8(view, off);
    off += 1;

    // If flag bit 0 is set, there's a name string following
    if (flags & 1) {
      const nameLen = readU16(view, off);
      off += 2 + nameLen;
    }

    colors.push({ r, g, b, a });
  }

  return colors;
}

function parseOldPaletteChunk04(view: DataView, chunkOffset: number): Color[] {
  const colors: Color[] = [];
  let off = chunkOffset + 6; // past chunk header

  const numPackets = readU16(view, off);
  off += 2;

  for (let p = 0; p < numPackets; p++) {
    readU8(view, off); // skip count
    off += 1;
    let count = readU8(view, off);
    off += 1;
    if (count === 0) count = 256;

    for (let c = 0; c < count; c++) {
      const r = readU8(view, off);
      off += 1;
      const g = readU8(view, off);
      off += 1;
      const b = readU8(view, off);
      off += 1;
      colors.push({ r, g, b, a: 255 });
    }
  }

  return colors;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Write a minimal Aseprite (.ase) file containing only a palette chunk.
 * The resulting file can be imported by Aseprite as a palette.
 *
 * Layout:
 *  - 128-byte file header
 *  - Frame header (16 bytes)
 *  - New palette chunk (0x2019)
 */
export function writeAsePalette(colors: Color[]): ArrayBuffer {
  const numColors = colors.length;
  if (numColors === 0) {
    throw new Error("Cannot write an empty palette");
  }

  // Each color entry: 2 (flags) + 4 (RGBA) = 6 bytes
  const entrySize = 6;
  const chunkDataSize =
    4 + // paletteSize (DWORD)
    4 + // firstColorIndex (DWORD)
    4 + // lastColorIndex (DWORD)
    8 + // reserved
    numColors * entrySize;
  const chunkSize = 6 + chunkDataSize; // 6 = chunk header (size + type)

  const frameBodySize = chunkSize;
  const frameSize = 16 + frameBodySize; // 16 = frame header

  const fileSize = 128 + frameSize; // 128 = file header

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // ---- File header (128 bytes) ----
  writeU32(view, 0, fileSize); // File size
  writeU16(view, 4, ASE_MAGIC); // Magic number
  writeU16(view, 6, 1); // Number of frames
  writeU16(view, 8, 1); // Width (dummy — palette file)
  writeU16(view, 10, 1); // Height (dummy)
  writeU16(view, 12, 32); // Color depth: 32 bpp (RGBA)
  writeU32(view, 14, 0); // Flags
  writeU16(view, 18, 100); // Speed (deprecated, ms between frames)
  // Bytes 20–27: must be 0 (already zeroed)
  writeU8(view, 28, 0); // Palette entry (transparent color index)
  // Bytes 29–31: ignore (padding)
  writeU16(view, 32, numColors); // Number of colors
  writeU8(view, 34, 8); // Pixel width (1:1 ratio)
  writeU8(view, 35, 8); // Pixel height
  // Bytes 36–39: grid position (0,0)
  writeU16(view, 38, 16); // Grid width
  writeU16(view, 40, 16); // Grid height
  // Bytes 42–127: reserved (zeroed)

  // ---- Frame header (16 bytes) ----
  let off = 128;
  writeU32(view, off, frameSize); // Bytes in this frame
  off += 4;
  writeU16(view, off, FRAME_MAGIC); // Frame magic
  off += 2;
  writeU16(view, off, 1); // Old num chunks field
  off += 2;
  writeU16(view, off, 100); // Frame duration (ms)
  off += 2;
  off += 2; // Reserved
  writeU32(view, off, 1); // New num chunks field
  off += 4;

  // ---- New palette chunk (0x2019) ----
  writeU32(view, off, chunkSize); // Chunk size
  off += 4;
  writeU16(view, off, CHUNK_NEW_PALETTE); // Chunk type
  off += 2;
  writeU32(view, off, numColors); // Palette size
  off += 4;
  writeU32(view, off, 0); // First color index
  off += 4;
  writeU32(view, off, numColors - 1); // Last color index
  off += 4;
  // 8 bytes reserved
  off += 8;

  // Color entries
  for (let i = 0; i < numColors; i++) {
    writeU16(view, off, 0); // Flags (no name)
    off += 2;
    writeU8(view, off, colors[i].r);
    off += 1;
    writeU8(view, off, colors[i].g);
    off += 1;
    writeU8(view, off, colors[i].b);
    off += 1;
    writeU8(view, off, colors[i].a);
    off += 1;
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Convenience: trigger a browser download of a palette file
// ---------------------------------------------------------------------------

export function downloadAsePalette(colors: Color[], filename = "palette.ase") {
  const buffer = writeAsePalette(colors);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
