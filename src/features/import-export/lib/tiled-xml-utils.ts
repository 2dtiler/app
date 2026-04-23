import type { Tileset } from "@/types";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

const MIME_BY_EXTENSION = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["webp", "image/webp"],
]);

const EXTENSION_BY_MIME = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/bmp", ".bmp"],
  ["image/webp", ".webp"],
]);

export function normalizeBundlePath(path: string) {
  const segments = path.replace(/\\/g, "/").split("/");
  const normalizedSegments: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
}

export function getDirname(path: string) {
  const normalized = normalizeBundlePath(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : "";
}

export function joinBundlePath(...segments: string[]) {
  return normalizeBundlePath(segments.filter(Boolean).join("/"));
}

export function resolveBundlePath(fromPath: string, relativePath: string) {
  if (relativePath.startsWith("/")) {
    return normalizeBundlePath(relativePath);
  }

  return normalizeBundlePath(
    `${getDirname(fromPath)}/${relativePath.replace(/\\/g, "/")}`,
  );
}

export function stripExtension(path: string) {
  const fileName = path.split("/").pop() ?? path;
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
}

export function encodeXmlDocument(document: XMLDocument) {
  const xml = new XMLSerializer().serializeToString(document);
  return new TextEncoder().encode(`${XML_HEADER}${xml}`);
}

export function decodeText(data: Uint8Array) {
  return new TextDecoder("utf-8").decode(data);
}

export function parseXmlDocument(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Invalid XML document.");
  }
  return document;
}

export function createXmlDocument(rootName: string) {
  return window.document.implementation.createDocument("", rootName, null);
}

export function getTileColumns(
  tileset: Pick<Tileset, "imageWidth" | "tileSize">,
) {
  return Math.max(1, Math.floor(tileset.imageWidth / tileset.tileSize));
}

export function getTileCount(
  tileset: Pick<Tileset, "imageWidth" | "imageHeight" | "tileSize">,
) {
  const columns = getTileColumns(tileset);
  const rows = Math.max(1, Math.floor(tileset.imageHeight / tileset.tileSize));
  return columns * rows;
}

export function getMimeTypeFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION.get(extension) ?? "application/octet-stream";
}

export function getFileExtensionFromMimeType(mimeType: string) {
  return EXTENSION_BY_MIME.get(mimeType) ?? ".bin";
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
