export function parseDataUrl(dataUrl: string): { b64: string; mime: string } {
  const [header, b64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:([^;]+)/);
  return { b64: b64 ?? "", mime: mimeMatch?.[1] ?? "image/png" };
}
