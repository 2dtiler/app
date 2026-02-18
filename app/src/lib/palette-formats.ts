import type { Color } from "@/types/image-editor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToColor(hex: string): Color | null {
  const h = hex.replace(/^#/, "").trim();
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 255,
    };
  }
  if (h.length === 8) {
    // AARRGGBB (Paint.NET convention)
    return {
      r: parseInt(h.slice(2, 4), 16),
      g: parseInt(h.slice(4, 6), 16),
      b: parseInt(h.slice(6, 8), 16),
      a: parseInt(h.slice(0, 2), 16),
    };
  }
  return null;
}

function colorToRgbHex(c: Color): string {
  return (
    c.r.toString(16).padStart(2, "0") +
    c.g.toString(16).padStart(2, "0") +
    c.b.toString(16).padStart(2, "0")
  );
}

// ---------------------------------------------------------------------------
// GIMP .GPL
// ---------------------------------------------------------------------------

export function parseGpl(text: string): Color[] {
  const colors: Color[] = [];
  let inColors = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!inColors) {
      if (line === "GIMP Palette") {
        inColors = true;
      }
      continue;
    }
    if (line.startsWith("#") || line === "") continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const r = parseInt(parts[0], 10);
    const g = parseInt(parts[1], 10);
    const b = parseInt(parts[2], 10);
    if (isNaN(r) || isNaN(g) || isNaN(b)) continue;
    colors.push({ r, g, b, a: 255 });
  }
  return colors;
}

export function writeGpl(colors: Color[], name: string): string {
  const lines: string[] = [
    "GIMP Palette",
    `#Palette Name: ${name}`,
    `#Colors: ${colors.length}`,
  ];
  for (const c of colors) {
    const hex = colorToRgbHex(c).toUpperCase();
    lines.push(`${c.r}\t${c.g}\t${c.b}\t${hex}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// JASC .PAL
// ---------------------------------------------------------------------------

export function parseJascPal(text: string): Color[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== "JASC-PAL") return [];
  // lines[1] = version ("0100"), lines[2] = color count
  const count = parseInt(lines[2], 10);
  if (isNaN(count)) return [];
  const colors: Color[] = [];
  for (let i = 3; i < 3 + count && i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 3) continue;
    const r = parseInt(parts[0], 10);
    const g = parseInt(parts[1], 10);
    const b = parseInt(parts[2], 10);
    if (isNaN(r) || isNaN(g) || isNaN(b)) continue;
    colors.push({ r, g, b, a: 255 });
  }
  return colors;
}

export function writeJascPal(colors: Color[]): string {
  const lines = ["JASC-PAL", "0100", String(colors.length)];
  for (const c of colors) {
    lines.push(`${c.r} ${c.g} ${c.b}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Paint.NET .TXT
// ---------------------------------------------------------------------------

export function parsePaintNetTxt(text: string): Color[] {
  const colors: Color[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith(";")) continue;
    const c = hexToColor(line);
    if (c) colors.push(c);
  }
  return colors;
}

export function writePaintNetTxt(colors: Color[], name: string): string {
  const lines = [
    ";paint.net Palette File",
    `;Palette Name: ${name}`,
    `;Colors: ${colors.length}`,
  ];
  for (const c of colors) {
    const a = c.a.toString(16).padStart(2, "0").toUpperCase();
    const hex = colorToRgbHex(c).toUpperCase();
    lines.push(`${a}${hex}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// .HEX File
// ---------------------------------------------------------------------------

export function parseHex(text: string): Color[] {
  const colors: Color[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith(";") || line.startsWith("//")) continue;
    const c = hexToColor(line.replace(/^#/, ""));
    if (c) colors.push(c);
  }
  return colors;
}

export function writeHex(colors: Color[]): string {
  return colors.map((c) => colorToRgbHex(c).toLowerCase()).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// PNG import/export
// ---------------------------------------------------------------------------

export function parsePng(buffer: ArrayBuffer): Promise<Color[]> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve([]);
        return;
      }
      ctx.drawImage(img, 0, 0);

      const swatchSize = img.naturalHeight;
      const numColors =
        swatchSize > 0
          ? Math.floor(img.naturalWidth / swatchSize)
          : img.naturalWidth;
      const colors: Color[] = [];

      if (swatchSize <= 1) {
        // Each pixel is one color
        const data = ctx.getImageData(0, 0, img.naturalWidth, 1).data;
        for (let x = 0; x < img.naturalWidth; x++) {
          colors.push({
            r: data[x * 4],
            g: data[x * 4 + 1],
            b: data[x * 4 + 2],
            a: data[x * 4 + 3],
          });
        }
      } else {
        // Sample centre pixel of each swatch block
        const cy = Math.floor(swatchSize / 2);
        for (let i = 0; i < numColors; i++) {
          const cx = i * swatchSize + Math.floor(swatchSize / 2);
          const px = ctx.getImageData(cx, cy, 1, 1).data;
          colors.push({ r: px[0], g: px[1], b: px[2], a: px[3] });
        }
      }

      resolve(colors);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load PNG"));
    };
    img.src = url;
  });
}

export function writePng(
  colors: Color[],
  swatchSize: 1 | 8 | 16 | 32,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = colors.length * swatchSize;
    canvas.height = swatchSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("No 2D context"));
      return;
    }

    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;
      ctx.fillRect(i * swatchSize, 0, swatchSize, swatchSize);
    }

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob returned null"));
    }, "image/png");
  });
}
