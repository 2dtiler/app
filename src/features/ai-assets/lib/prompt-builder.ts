import type {
  AssetType,
  BackgroundConfig,
  IconConfig,
  SpriteConfig,
  StyleStack,
  TilesetConfig,
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
  const palette = `${style.colorPalette} color palette`;
  const backgroundSuffix = transparent
    ? "transparent background"
    : "solid background";

  switch (assetType) {
    case "tileset": {
      const transitionString =
        tileset.transition !== "None"
          ? ` blending into ${tileset.transition.toLowerCase()}`
          : "";
      const seamlessString = tileset.seamless ? "seamless " : "";
      const isometricString =
        tileset.perspective === "Isometric 2:1"
          ? "isometric 2:1 ratio, "
          : "top-down view, ";
      return (
        `${seamlessString}${tileset.maskMode} autotile set of ` +
        `${tileset.terrain.toLowerCase()} ${tileset.tileType.toLowerCase()} terrain${transitionString}. ` +
        `${isometricString}${px}px per tile, ` +
        `${art} style, ${palette}, ` +
        `clean grid layout, high contrast, ${backgroundSuffix}.`
      );
    }
    case "sprite": {
      const directionString =
        !sprite.perspective.startsWith("side") && sprite.direction !== "None"
          ? `, facing ${sprite.direction.toLowerCase()}`
          : "";
      return (
        `Horizontal sprite sheet of a ${sprite.proportion} ${sprite.role.toLowerCase()} ` +
        `in a ${sprite.frameCount}-frame ${sprite.perspective} ${sprite.animState} animation${directionString}. ` +
        `Each frame ${px}px, consistent proportions across all frames, ` +
        `${art} style, ${palette}, ${backgroundSuffix}.`
      );
    }
    case "background": {
      const seamlessString = bg.seamless ? "seamless horizontally tiling " : "";
      return (
        `${seamlessString}${bg.layer} parallax background layer, ` +
        `${bg.mood.toLowerCase()} ${bg.environment.toLowerCase()} environment. ` +
        `Atmospheric depth, ${art} style, ${palette}, ` +
        `wide aspect ratio, no UI elements, ${backgroundSuffix}.`
      );
    }
    case "icon": {
      const rarityString =
        icon.rarity !== "Common"
          ? `${icon.rarity.toLowerCase()} quality, `
          : "";
      return (
        `Single item icon of a ${rarityString}${icon.type.toLowerCase()} (${icon.category.toLowerCase()}). ` +
        `${px}px, centered composition, ` +
        `${art} style, ${palette}, ` +
        `sharp linework, readable silhouette, ${backgroundSuffix}.`
      );
    }
    case "ui": {
      const nineSliceString = ui.nineSlice
        ? "designed for 9-slice scaling with fixed corners and scalable edges, "
        : "";
      return (
        `${ui.theme} ${ui.elementType.toLowerCase()} UI graphic. ` +
        `${nineSliceString}` +
        `${art} style, ${palette}, ` +
        `clean lines, centered for text placement if applicable, ${backgroundSuffix}.`
      );
    }
    case "vfx": {
      return (
        `${vfx.frameCount}-frame ${art} ${vfx.action.toLowerCase()} VFX animation sprite sheet. ` +
        `${vfx.size}px frames arranged in a horizontal strip, outward expansion, ` +
        `${palette}, high contrast, ${backgroundSuffix}.`
      );
    }
  }
}
