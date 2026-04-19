import type { QueryLocalFontsWindow, TextObjectFontOption } from "@/types";

export const FONT_FAMILY_PRESETS: TextObjectFontOption[] = [
  { family: "sans-serif" },
  { family: "serif" },
  { family: "monospace" },
  { family: "Space Grotesk" },
  { family: "Space Mono" },
  { family: "Doto" },
  { family: "Arial" },
  { family: "Helvetica" },
  { family: "Georgia" },
  { family: "Times New Roman" },
  { family: "Courier New" },
  { family: "Menlo" },
];

export function canQueryLocalFonts(): boolean {
  return (
    typeof (window as QueryLocalFontsWindow).queryLocalFonts === "function"
  );
}

export async function loadLocalFontFamilies(): Promise<TextObjectFontOption[]> {
  const localWindow = window as QueryLocalFontsWindow;
  if (typeof localWindow.queryLocalFonts !== "function") return [];

  const results = await localWindow.queryLocalFonts();
  const byFamily = new Map<string, TextObjectFontOption>();

  for (const font of results) {
    if (!font.family || byFamily.has(font.family)) continue;
    byFamily.set(font.family, {
      family: font.family,
      fullName: font.fullName,
      postscriptName: font.postscriptName,
      style: font.style,
    });
  }

  return [...byFamily.values()].sort((left, right) =>
    left.family.localeCompare(right.family),
  );
}
