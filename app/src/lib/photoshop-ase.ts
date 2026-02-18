/**
 * Adobe Swatch Exchange (.ase) palette format parser and writer.
 *
 * This is the format used by Adobe Photoshop, Illustrator, and InDesign.
 * It is NOT the same as the Aseprite (.ase / .aseprite) format.
 *
 * Reference: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/#50577411_pgfId-1055819
 * Community docs: http://www.selapa.net/swatches/colors/fileformats.php#adobe_ase
 */

import type { Color } from "@/types/image-editor";

// File signature: "ASEF"
const ASE_SIGNATURE = 0x41534546;
const BLOCK_COLOR = 0x0001;

// ---------------------------------------------------------------------------
// Read helpers (big-endian)
// ---------------------------------------------------------------------------

function readU16BE(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readU32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readF32BE(view: DataView, offset: number): number {
  return view.getFloat32(offset, false);
}

function readAscii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Write helpers (big-endian)
// ---------------------------------------------------------------------------

function writeU16BE(view: DataView, offset: number, val: number) {
  view.setUint16(offset, val, false);
}

function writeU32BE(view: DataView, offset: number, val: number) {
  view.setUint32(offset, val, false);
}

function writeF32BE(view: DataView, offset: number, val: number) {
  view.setFloat32(offset, val, false);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an Adobe Swatch Exchange (.ase) file and extract colors as RGBA.
 */
export function parsePhotoshopAse(buffer: ArrayBuffer): Color[] {
  const view = new DataView(buffer);

  if (buffer.byteLength < 12) {
    throw new Error("File too small to be an ASE file");
  }

  const sig = readU32BE(view, 0);
  if (sig !== ASE_SIGNATURE) {
    throw new Error("Not a valid Adobe ASE file (bad signature)");
  }

  // Version: major (2 bytes) + minor (2 bytes) — expect 1.0
  // readU16BE(view, 4) // major
  // readU16BE(view, 6) // minor

  const blockCount = readU32BE(view, 8);
  const colors: Color[] = [];

  let off = 12;
  for (let b = 0; b < blockCount; b++) {
    if (off + 6 > buffer.byteLength) break;

    const blockType = readU16BE(view, off);
    off += 2;
    const blockLength = readU32BE(view, off);
    off += 4;

    const blockDataStart = off;

    if (blockType === BLOCK_COLOR && blockLength > 0) {
      const nameLen = readU16BE(view, off);
      off += 2;
      // name is UTF-16 BE, nameLen includes the trailing NUL
      off += nameLen * 2;

      const model = readAscii(view, off, 4);
      off += 4;

      let r = 0,
        g = 0,
        b = 0;

      if (model === "RGB ") {
        r = Math.round(readF32BE(view, off) * 255);
        off += 4;
        g = Math.round(readF32BE(view, off) * 255);
        off += 4;
        b = Math.round(readF32BE(view, off) * 255);
        off += 4;
      } else if (model === "CMYK") {
        const c = readF32BE(view, off);
        off += 4;
        const m = readF32BE(view, off);
        off += 4;
        const y = readF32BE(view, off);
        off += 4;
        const k = readF32BE(view, off);
        off += 4;
        r = Math.round(255 * (1 - c) * (1 - k));
        g = Math.round(255 * (1 - m) * (1 - k));
        b = Math.round(255 * (1 - y) * (1 - k));
      } else if (model === "LAB ") {
        const L = readF32BE(view, off);
        off += 4;
        const A = readF32BE(view, off);
        off += 4;
        const B = readF32BE(view, off);
        off += 4;
        // Convert CIE Lab → XYZ → sRGB (D65 illuminant)
        const fy = (L + 16) / 116;
        const fx = A / 500 + fy;
        const fz = fy - B / 200;
        const d65x = 0.95047,
          d65y = 1.0,
          d65z = 1.08883;
        const cube = (t: number) =>
          t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787;
        const x = d65x * cube(fx);
        const y2 = d65y * cube(fy);
        const z = d65z * cube(fz);
        const linearToSrgb = (u: number) =>
          u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
        r = Math.max(
          0,
          Math.min(
            255,
            Math.round(
              linearToSrgb(3.2406 * x - 1.5372 * y2 - 0.4986 * z) * 255,
            ),
          ),
        );
        g = Math.max(
          0,
          Math.min(
            255,
            Math.round(
              linearToSrgb(-0.9689 * x + 1.8758 * y2 + 0.0415 * z) * 255,
            ),
          ),
        );
        b = Math.max(
          0,
          Math.min(
            255,
            Math.round(linearToSrgb(0.0557 * x - 0.204 * y2 + 1.057 * z) * 255),
          ),
        );
      } else if (model === "Gray") {
        const gray = Math.round(readF32BE(view, off) * 255);
        off += 4;
        r = g = b = gray;
      }

      // Skip color type WORD + any remaining block data
      colors.push({ r: clamp(r), g: clamp(g), b: clamp(b), a: 255 });
    }

    // Always advance by declared block length from block data start
    off = blockDataStart + blockLength;
  }

  return colors;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Write an Adobe Swatch Exchange (.ase) file from an array of RGBA colors.
 * Colors are written as RGB swatches (alpha is ignored; ASE has no alpha).
 */
export function writePhotoshopAse(colors: Color[]): ArrayBuffer {
  const numColors = colors.length;
  if (numColors === 0) {
    throw new Error("Cannot write an empty palette");
  }

  // Each color block layout:
  //   2  block type
  //   4  block length
  //   2  name length (= 1 for empty name: just the NUL char)
  //   2  name (NUL UTF-16 char)
  //   4  color model "RGB "
  //  12  3x float32 (R, G, B)
  //   2  color type
  // = 28 bytes total per color block (6 header + 22 data)
  const blockDataSize = 2 + 2 + 4 + 12 + 2; // nameLen(2) + name(2) + model(4) + rgb(12) + type(2)
  const blockSize = 2 + 4 + blockDataSize; // blockType(2) + blockLength(4) + data

  const fileSize = 12 + numColors * blockSize; // signature(4) + version(4) + count(4)
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  let off = 0;

  // Signature "ASEF"
  writeU32BE(view, off, ASE_SIGNATURE);
  off += 4;
  // Version 1.0
  writeU16BE(view, off, 1);
  off += 2; // major
  writeU16BE(view, off, 0);
  off += 2; // minor
  // Block count
  writeU32BE(view, off, numColors);
  off += 4;

  for (const c of colors) {
    // Block type: color entry
    writeU16BE(view, off, BLOCK_COLOR);
    off += 2;
    // Block length (bytes of block data, excluding type+length fields themselves)
    writeU32BE(view, off, blockDataSize);
    off += 4;
    // Name length (1 = just NUL terminator)
    writeU16BE(view, off, 1);
    off += 2;
    // Name: NUL char (UTF-16 BE)
    writeU16BE(view, off, 0);
    off += 2;
    // Color model "RGB "
    view.setUint8(off, 0x52);
    off++; // R
    view.setUint8(off, 0x47);
    off++; // G
    view.setUint8(off, 0x42);
    off++; // B
    view.setUint8(off, 0x20);
    off++; // space
    // R, G, B as float32 [0.0, 1.0]
    writeF32BE(view, off, c.r / 255);
    off += 4;
    writeF32BE(view, off, c.g / 255);
    off += 4;
    writeF32BE(view, off, c.b / 255);
    off += 4;
    // Color type: 0 = global
    writeU16BE(view, off, 0);
    off += 2;
  }

  return buf;
}
