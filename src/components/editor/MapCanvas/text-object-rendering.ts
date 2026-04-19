import type { MapObject, TextObjectBounds } from "@/types";
import { getTextObjectSettings, isTextObject } from "@/lib/text-objects";

const TEXT_LINE_HEIGHT = 1.25;
const TEXT_PADDING = 4;

function normalizeTextLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function wrapLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  if (maxWidth <= 0) return [text];

  const words = text.split(/(\s+)/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = `${current}${word}`;
    if (!current || ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }

    if (current.trim()) {
      lines.push(current.trimEnd());
      current = word.trimStart();
      continue;
    }

    let segment = "";
    for (const char of word) {
      const nextSegment = `${segment}${char}`;
      if (segment && ctx.measureText(nextSegment).width > maxWidth) {
        lines.push(segment);
        segment = char;
      } else {
        segment = nextSegment;
      }
    }
    current = segment;
  }

  lines.push(current.trimEnd());
  return lines;
}

export function getTextObjectLayout(
  ctx: CanvasRenderingContext2D,
  object: MapObject,
  zoom: number,
) {
  const settings = getTextObjectSettings(object);
  const fontSize = settings.size * zoom;
  const lineHeight = Math.max(fontSize * TEXT_LINE_HEIGHT, fontSize + 2);
  ctx.font = `${fontSize}px ${settings.font}`;

  const availableWidth = Math.max(object.width * zoom - TEXT_PADDING * 2, 1);
  const sourceLines = normalizeTextLines(settings.text);
  const lines = settings.wordWrap
    ? sourceLines.flatMap((line) => wrapLine(ctx, line, availableWidth))
    : sourceLines;

  return {
    settings,
    lines,
    fontSize,
    lineHeight,
    padding: TEXT_PADDING,
  };
}

export function drawTextObject(
  ctx: CanvasRenderingContext2D,
  object: MapObject,
  bounds: TextObjectBounds,
  zoom: number,
  isActive: boolean,
) {
  if (!isTextObject(object)) return;

  const { x, y, width, height } = bounds;
  const { settings, lines, lineHeight, padding } = getTextObjectLayout(
    ctx,
    object,
    zoom,
  );
  const textX = x + padding;
  const textY = y + padding;
  const clipWidth = Math.max(width - padding * 2, 1);
  const clipHeight = Math.max(height - padding * 2, 1);

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((settings.rotation * Math.PI) / 180);

  ctx.beginPath();
  ctx.rect(-width / 2, -height / 2, width, height);
  ctx.clip();

  ctx.fillStyle = settings.color;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const localX = -width / 2 + padding;
  let localY = -height / 2 + padding;
  for (const line of lines) {
    if (localY + lineHeight > -height / 2 + padding + clipHeight + lineHeight) {
      break;
    }
    ctx.fillText(line, localX, localY, clipWidth);
    localY += lineHeight;
  }
  ctx.restore();

  if (isActive) {
    ctx.save();
    ctx.strokeStyle = "rgba(0, 170, 255, 0.15)";
    ctx.strokeRect(textX, textY, clipWidth, clipHeight);
    ctx.restore();
  }
}

export function measureTextObjectHeight(
  ctx: CanvasRenderingContext2D,
  object: MapObject,
  zoom: number,
) {
  const { lines, lineHeight, padding } = getTextObjectLayout(ctx, object, zoom);
  return lines.length * lineHeight + padding * 2;
}