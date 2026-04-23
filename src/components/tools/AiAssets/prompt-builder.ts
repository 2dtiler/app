import type {
  AssetType,
  StyleStack,
  TilesetConfig,
  SpriteConfig,
  BackgroundConfig,
  IconConfig,
  UIConfig,
  VFXConfig,
} from "@/types/integrations/ai-assets";

export function buildPrompt(
  assetType: AssetType,
  tileset: TilesetConfig,
  sprite: SpriteConfig,
  bg: BackgroundConfig,
  icon: IconConfig,
  ui: UIConfig,
  vfx: VFXConfig,
  style: StyleStack,
  transparent: boolean,
): string {
  const px = style.spriteSize;
  const art = style.artStyle;
  const pal = `${style.colorPalette} color palette`;
  const bgSuffix = transparent ? "transparent background" : "solid background";

  switch (assetType) {
    case "tileset": {
      const transStr =
        tileset.transition !== "None"
          ? ` blending into ${tileset.transition.toLowerCase()}`
          : "";
      const seamlessStr = tileset.seamless ? "seamless " : "";
      const isoStr =
        tileset.perspective === "Isometric 2:1"
          ? "isometric 2:1 ratio, "
          : "top-down view, ";
      return (
        `${seamlessStr}${tileset.maskMode} autotile set of ` +
        `${tileset.terrain.toLowerCase()} ${tileset.tileType.toLowerCase()} terrain${transStr}. ` +
        `${isoStr}${px}px per tile, ` +
        `${art} style, ${pal}, ` +
        `clean grid layout, high contrast, ${bgSuffix}.`
      );
    }
    case "sprite": {
      const dirStr =
        !sprite.perspective.startsWith("side") && sprite.direction !== "None"
          ? `, facing ${sprite.direction.toLowerCase()}`
          : "";
      return (
        `Horizontal sprite sheet of a ${sprite.proportion} ${sprite.role.toLowerCase()} ` +
        `in a ${sprite.frameCount}-frame ${sprite.perspective} ${sprite.animState} animation${dirStr}. ` +
        `Each frame ${px}px, consistent proportions across all frames, ` +
        `${art} style, ${pal}, ${bgSuffix}.`
      );
    }
    case "background": {
      const seamlessStr = bg.seamless ? "seamless horizontally tiling " : "";
      return (
        `${seamlessStr}${bg.layer} parallax background layer, ` +
        `${bg.mood.toLowerCase()} ${bg.environment.toLowerCase()} environment. ` +
        `Atmospheric depth, ${art} style, ${pal}, ` +
        `wide aspect ratio, no UI elements, ${bgSuffix}.`
      );
    }
    case "icon": {
      const rarityStr =
        icon.rarity !== "Common"
          ? `${icon.rarity.toLowerCase()} quality, `
          : "";
      return (
        `Single item icon of a ${rarityStr}${icon.type.toLowerCase()} (${icon.category.toLowerCase()}). ` +
        `${px}px, centered composition, ` +
        `${art} style, ${pal}, ` +
        `sharp linework, readable silhouette, ${bgSuffix}.`
      );
    }
    case "ui": {
      const nineSliceStr = ui.nineSlice
        ? "designed for 9-slice scaling with fixed corners and scalable edges, "
        : "";
      return (
        `${ui.theme} ${ui.elementType.toLowerCase()} UI graphic. ` +
        `${nineSliceStr}` +
        `${art} style, ${pal}, ` +
        `clean lines, centered for text placement if applicable, ${bgSuffix}.`
      );
    }
    case "vfx": {
      return (
        `${vfx.frameCount}-frame ${art} ${vfx.action.toLowerCase()} VFX animation sprite sheet. ` +
        `${vfx.size}px frames arranged in a horizontal strip, outward expansion, ` +
        `${pal}, high contrast, ${bgSuffix}.`
      );
    }
  }
}
