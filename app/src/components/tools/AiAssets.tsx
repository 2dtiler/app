import { useState, useEffect, useCallback } from "react";
import { Loader2, X, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Asset taxonomy
type AssetType = "tileset" | "sprite" | "background" | "icon" | "ui" | "vfx";

/** Style Stack — shared visual DNA applied to every generated prompt */
interface StyleStack {
  artStyle: string;
  colorPalette: string;
  spriteSize: string;
}

// Per-asset configuration interfaces
interface TilesetConfig {
  tileType: string;
  terrain: string;
  transition: string;
  maskMode: string;
  perspective: string;
  seamless: boolean;
}

interface SpriteConfig {
  role: string;
  animState: string;
  perspective: string;
  direction: string;
  frameCount: string;
  proportion: string;
}

interface BackgroundConfig {
  layer: string;
  environment: string;
  mood: string;
  seamless: boolean;
}

interface IconConfig {
  category: string;
  type: string;
  rarity: string;
}

interface UIConfig {
  elementType: string;
  theme: string;
  nineSlice: boolean;
}

interface VFXConfig {
  action: string;
  frameCount: string;
  size: string;
}

// Puter model definition
interface ModelDef {
  id: string;
  label: string;
  /** puter.js provider string */
  provider: "openai-image-generation" | "gemini" | "together" | "xai";
  /** Model identifier passed to puter.ai.txt2img */
  puterModel: string;
  /** Whether this model accepts an input image (img2img) */
  supportsImg2Img: boolean;
  /** Aspect ratios this model supports; undefined = all; empty array = none */
  supportedRatios?: Ratio[];
}

type Ratio = "1:1" | "4:3" | "16:9" | "3:4";

interface RatioDef {
  value: Ratio;
  label: string;
  w: number;
  h: number;
}

type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MODELS: ModelDef[] = [
  {
    id: "gpt-image-1-mini",
    label: "GPT Image 1 Mini (fast)",
    provider: "openai-image-generation",
    puterModel: "gpt-image-1-mini",
    supportsImg2Img: false,
  },
  {
    id: "gpt-image-1",
    label: "GPT Image 1 (quality)",
    provider: "openai-image-generation",
    puterModel: "gpt-image-1",
    supportsImg2Img: false,
  },
  {
    id: "dall-e-3",
    label: "DALL-E 3",
    provider: "openai-image-generation",
    puterModel: "dall-e-3",
    supportsImg2Img: false,
  },
  {
    id: "gemini-img",
    label: "Gemini 3 Pro Image",
    provider: "gemini",
    puterModel: "gemini-3-pro-image-preview",
    supportsImg2Img: true,
    supportedRatios: ["1:1"],
  },
  {
    id: "grok-image",
    label: "Grok Image (xAI)",
    provider: "xai",
    puterModel: "grok-2-image",
    supportsImg2Img: false,
    supportedRatios: [],
  },
  {
    id: "flux-schnell",
    label: "FLUX.1 Schnell (Together)",
    provider: "together",
    puterModel: "black-forest-labs/FLUX.1-schnell-Free",
    supportsImg2Img: true,
  },
];

/** Provider display names for grouping the model select */
const PROVIDER_LABELS: Record<string, string> = {
  "openai-image-generation": "OpenAI",
  gemini: "Google",
  xai: "xAI",
  together: "Together AI",
};

const ALL_RATIOS: RatioDef[] = [
  { value: "1:1", label: "Square (1:1)", w: 1024, h: 1024 },
  { value: "4:3", label: "Landscape (4:3)", w: 1024, h: 768 },
  { value: "16:9", label: "Wide (16:9)", w: 1280, h: 720 },
  { value: "3:4", label: "Portrait (3:4)", w: 768, h: 1024 },
];

const COUNT_OPTIONS = [1, 2];

// Asset type definitions
const ASSET_TYPE_DEFS: { value: AssetType; label: string; description: string }[] = [
  { value: "tileset",    label: "Tileset",       description: "Grid-based environment tiles" },
  { value: "sprite",     label: "Sprite Sheet",  description: "Animated character frames" },
  { value: "background", label: "Background",    description: "Parallax scene layers" },
  { value: "icon",       label: "Item Icon",     description: "Inventory & skill icons" },
  { value: "ui",         label: "UI Element",    description: "Buttons, panels & HUD" },
  { value: "vfx",        label: "VFX",           description: "Effects & particle sprites" },
];

// Style Stack options
const ART_STYLES = [
  { value: "pixel art",                   label: "Pixel Art" },
  { value: "vector art with clean lines", label: "Vector" },
  { value: "hand-painted",                label: "Hand-Painted" },
  { value: "cel-shaded",                  label: "Cel-Shaded" },
  { value: "watercolor",                  label: "Watercolor" },
];

const COLOR_PALETTES = [
  { value: "vibrant",          label: "Vibrant" },
  { value: "pastel",           label: "Pastel" },
  { value: "muted and gritty", label: "Muted / Gritty" },
  { value: "monochromatic",    label: "Monochromatic" },
  { value: "neon",             label: "Neon" },
  { value: "warm earth tones", label: "Earth Tones" },
];

const SPRITE_SIZES = ["16x16", "32x32", "64x64", "128x128"];

// Tileset options
const TILESET_TILE_TYPES = ["Ground", "Wall", "Object / Prop", "Path", "Liquid"];
const TILESET_TERRAINS = [
  "Grass", "Dirt", "Sand", "Snow", "Stone", "Cobblestone",
  "Lava", "Water", "Ice", "Forest Floor", "Mud", "Marble",
];
const TILESET_TRANSITIONS = [
  "None", "Grass", "Dirt", "Sand", "Snow", "Stone", "Lava", "Water", "Ice",
];
const MASK_MODES = [
  { value: "seamless 47-tile blob", label: "47-Tile Blob (organic terrain)" },
  { value: "16-tile corner mask",   label: "16-Tile Corner (paths & boxes)" },
  { value: "Wang tile",             label: "Wang Tiles (non-periodic)" },
  { value: "dual grid",             label: "Dual Grid (biome blending)" },
];
const TILESET_PERSPECTIVES = ["Top-down", "Isometric 2:1"];

// Sprite options
const SPRITE_ROLES = ["Hero / Player", "NPC", "Enemy", "Monster", "Boss"];
const ANIM_STATES = [
  { value: "idle",   hint: "2–4 frames, looping" },
  { value: "walk",   hint: "4–8 frames, looping" },
  { value: "run",    hint: "8–12 frames, looping" },
  { value: "attack", hint: "5–10 frames, one-shot" },
  { value: "jump",   hint: "3–5 frames, one-shot" },
  { value: "hurt",   hint: "2–4 frames, one-shot" },
  { value: "die",    hint: "4–8 frames, one-shot" },
];
const SPRITE_PERSPECTIVES = [
  "side-view",
  "top-down 4-directional",
  "top-down 8-directional",
  "isometric",
];
const SPRITE_DIRECTIONS = [
  "South", "South-West", "West", "North-West",
  "North", "North-East", "East", "South-East",
];
const FRAME_COUNTS = ["2", "4", "6", "8", "10", "12"];
const PROPORTIONS = [
  { value: "chibi / super-deformed", label: "Chibi (large head, expressive)" },
  { value: "semi-realistic",         label: "Semi-Realistic" },
  { value: "realistic proportions",  label: "Realistic" },
];

// Background options
const BG_LAYERS = [
  { value: "foreground",   label: "Foreground (fast scroll)" },
  { value: "midground",    label: "Midground (standard)" },
  { value: "far / skybox", label: "Far / Skybox (slow)" },
];
const BG_ENVIRONMENTS = [
  "Forest", "City", "Mountains", "Space", "Desert",
  "Ocean", "Cave / Underground", "Fantasy Castle", "Sci-fi Station", "Ruins", "Arctic",
];
const BG_MOODS = [
  "Day", "Night", "Dusk", "Dawn", "Spooky", "Mystical", "Stormy", "Post-Apocalyptic",
];

// Icon options
const ICON_CATEGORIES = [
  "Consumable", "Weapon", "Armor / Accessory", "Resource", "Skill / Status",
];
const ICON_TYPES: Record<string, string[]> = {
  "Consumable":        ["Health Potion", "Mana Elixir", "Herb", "Food", "Scroll", "Bomb"],
  "Weapon":            ["Sword", "Axe", "Bow", "Staff", "Dagger", "Spear", "Wand", "Shield"],
  "Armor / Accessory": ["Helmet", "Chest Armor", "Gauntlets", "Boots", "Ring", "Amulet", "Cape"],
  "Resource":          ["Ore", "Wood", "Gem", "Monster Drop", "Crafting Material", "Coin"],
  "Skill / Status":    ["Fire Spell", "Lightning Spell", "Poison", "Haste", "Shield Buff", "Heal"],
};
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

// UI options
const UI_ELEMENT_TYPES = [
  "Button", "Panel / Dialog Box", "Health Bar", "Mana Bar",
  "Inventory Slot", "Cursor", "Tooltip Box", "Menu Frame",
];
const UI_THEMES = [
  "Fantasy", "Sci-fi", "Minimal / Flat", "Wooden", "Stone", "Metal", "Dark / Gothic",
];

// VFX options
const VFX_ACTIONS = [
  "Explosion", "Fire", "Magic Spell", "Smoke", "Water Splash",
  "Lightning", "Poison Cloud", "Ice Shard", "Heal Glow", "Dust Puff",
];
const VFX_FRAME_COUNTS = ["4", "6", "8", "12", "16"];
const VFX_SIZES = ["32x32", "64x64", "128x128"];

// ---------------------------------------------------------------------------
// Prompt builder — Style Stack algorithm
// ---------------------------------------------------------------------------
function buildPrompt(
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
  const px  = style.spriteSize;
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
        icon.rarity !== "Common" ? `${icon.rarity.toLowerCase()} quality, ` : "";
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

// ---------------------------------------------------------------------------
// Per-asset configuration forms
// ---------------------------------------------------------------------------
function TilesetConfigForm({
  config,
  onChange,
}: {
  config: TilesetConfig;
  onChange: (c: TilesetConfig) => void;
}) {
  const set = <K extends keyof TilesetConfig>(k: K, v: TilesetConfig[K]) =>
    onChange({ ...config, [k]: v });
  return (
    <>
      <div className="space-y-1.5">
        <Label>Tile Type</Label>
        <Select value={config.tileType} onValueChange={(v) => set("tileType", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TILESET_TILE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Terrain</Label>
        <Select value={config.terrain} onValueChange={(v) => set("terrain", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TILESET_TERRAINS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Transition To</Label>
        <Select value={config.transition} onValueChange={(v) => set("transition", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TILESET_TRANSITIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Autotile Mode</Label>
        <Select value={config.maskMode} onValueChange={(v) => set("maskMode", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MASK_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Perspective</Label>
        <Select value={config.perspective} onValueChange={(v) => set("perspective", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TILESET_PERSPECTIVES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label className="text-sm">Seamless Tiling</Label>
        <Switch checked={config.seamless} onCheckedChange={(v) => set("seamless", v)} />
      </div>
    </>
  );
}

function SpriteConfigForm({
  config,
  onChange,
}: {
  config: SpriteConfig;
  onChange: (c: SpriteConfig) => void;
}) {
  const set = <K extends keyof SpriteConfig>(k: K, v: SpriteConfig[K]) =>
    onChange({ ...config, [k]: v });
  const showDirection = !config.perspective.startsWith("side");
  return (
    <>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={config.role} onValueChange={(v) => set("role", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SPRITE_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Animation State</Label>
        <Select value={config.animState} onValueChange={(v) => set("animState", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANIM_STATES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.value.charAt(0).toUpperCase() + a.value.slice(1)}
                <span className="ml-1 text-muted-foreground">({a.hint})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Perspective</Label>
        <Select value={config.perspective} onValueChange={(v) => set("perspective", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SPRITE_PERSPECTIVES.map((p) => (
              <SelectItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showDirection && (
        <div className="space-y-1.5">
          <Label>Direction</Label>
          <Select value={config.direction} onValueChange={(v) => set("direction", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SPRITE_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Frame Count</Label>
        <Select value={config.frameCount} onValueChange={(v) => set("frameCount", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FRAME_COUNTS.map((f) => <SelectItem key={f} value={f}>{f} frames</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Proportion Style</Label>
        <Select value={config.proportion} onValueChange={(v) => set("proportion", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROPORTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function BackgroundConfigForm({
  config,
  onChange,
}: {
  config: BackgroundConfig;
  onChange: (c: BackgroundConfig) => void;
}) {
  const set = <K extends keyof BackgroundConfig>(k: K, v: BackgroundConfig[K]) =>
    onChange({ ...config, [k]: v });
  return (
    <>
      <div className="space-y-1.5">
        <Label>Parallax Layer</Label>
        <Select value={config.layer} onValueChange={(v) => set("layer", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BG_LAYERS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Environment</Label>
        <Select value={config.environment} onValueChange={(v) => set("environment", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BG_ENVIRONMENTS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Mood / Time of Day</Label>
        <Select value={config.mood} onValueChange={(v) => set("mood", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BG_MOODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm">Seamless Loop</Label>
          <p className="text-[10px] text-muted-foreground">Horizontal tiling</p>
        </div>
        <Switch checked={config.seamless} onCheckedChange={(v) => set("seamless", v)} />
      </div>
    </>
  );
}

function IconConfigForm({
  config,
  onChange,
}: {
  config: IconConfig;
  onChange: (c: IconConfig) => void;
}) {
  const set = <K extends keyof IconConfig>(k: K, v: IconConfig[K]) =>
    onChange({ ...config, [k]: v });
  const typeOptions = ICON_TYPES[config.category] ?? [];
  return (
    <>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select
          value={config.category}
          onValueChange={(v) =>
            onChange({ ...config, category: v, type: ICON_TYPES[v]?.[0] ?? "" })
          }
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ICON_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={config.type} onValueChange={(v) => set("type", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {typeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Rarity</Label>
        <Select value={config.rarity} onValueChange={(v) => set("rarity", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RARITIES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function UIConfigForm({
  config,
  onChange,
}: {
  config: UIConfig;
  onChange: (c: UIConfig) => void;
}) {
  const set = <K extends keyof UIConfig>(k: K, v: UIConfig[K]) =>
    onChange({ ...config, [k]: v });
  return (
    <>
      <div className="space-y-1.5">
        <Label>Element Type</Label>
        <Select value={config.elementType} onValueChange={(v) => set("elementType", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UI_ELEMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Theme</Label>
        <Select value={config.theme} onValueChange={(v) => set("theme", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UI_THEMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm">9-Slice Ready</Label>
          <p className="text-[10px] text-muted-foreground">Fixed corners, scalable edges</p>
        </div>
        <Switch checked={config.nineSlice} onCheckedChange={(v) => set("nineSlice", v)} />
      </div>
    </>
  );
}

function VFXConfigForm({
  config,
  onChange,
}: {
  config: VFXConfig;
  onChange: (c: VFXConfig) => void;
}) {
  const set = <K extends keyof VFXConfig>(k: K, v: VFXConfig[K]) =>
    onChange({ ...config, [k]: v });
  return (
    <>
      <div className="space-y-1.5">
        <Label>Effect</Label>
        <Select value={config.action} onValueChange={(v) => set("action", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VFX_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Frame Count</Label>
        <Select value={config.frameCount} onValueChange={(v) => set("frameCount", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VFX_FRAME_COUNTS.map((f) => <SelectItem key={f} value={f}>{f} frames</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Frame Size</Label>
        <Select value={config.size} onValueChange={(v) => set("size", v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VFX_SIZES.map((s) => <SelectItem key={s} value={s}>{s}px</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Image Upload helper component
// ---------------------------------------------------------------------------
function ImageUpload({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  label: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const resized = await resizeImage(file, 1280);
      onChange(resized);
    } catch (err) {
      console.error("Failed to resize image", err);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/25 hover:bg-muted/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        {value ? (
          <div className="relative w-full">
            <img
              src={value}
              alt="Upload preview"
              className="max-h-30 w-full object-contain"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
            <Upload className="mb-1 h-6 w-6 opacity-50" />
            <p>Drag &amp; drop an image here, or click to select</p>
          </div>
        )}
      </div>
    </div>
  );
}

async function resizeImage(
  file: File,
  maxSize: number = 1280,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL(file.type));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Strip the "data:<mime>;base64," prefix, return base64 string and mime type */
function parseDataUrl(dataUrl: string): { b64: string; mime: string } {
  const [header, b64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:([^;]+)/);
  return { b64: b64 ?? "", mime: mimeMatch?.[1] ?? "image/png" };
}

// ---------------------------------------------------------------------------
// Single image cell
// ---------------------------------------------------------------------------
function ImageCell({ state, index }: { state: ImageState; index: number }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/30 flex items-center justify-center">
      {state.status === "idle" && (
        <span className="text-xs text-muted-foreground select-none">
          #{index + 1}
        </span>
      )}

      {state.status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Generating...</span>
        </div>
      )}

      {state.status === "done" && (
        <img
          src={state.url}
          alt={`Generated image ${index + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {state.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <X className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-xs text-destructive leading-snug">
            {state.message}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generator (main UI)
// ---------------------------------------------------------------------------
function Generator() {
  // Asset type
  const [assetType, setAssetType] = useState<AssetType>("tileset");

  // Per-asset configs
  const [tilesetCfg, setTilesetCfg] = useState<TilesetConfig>({
    tileType: "Ground",
    terrain: "Grass",
    transition: "None",
    maskMode: "seamless 47-tile blob",
    perspective: "Top-down",
    seamless: true,
  });
  const [spriteCfg, setSpriteCfg] = useState<SpriteConfig>({
    role: "Hero / Player",
    animState: "idle",
    perspective: "side-view",
    direction: "South",
    frameCount: "4",
    proportion: "semi-realistic",
  });
  const [bgCfg, setBgCfg] = useState<BackgroundConfig>({
    layer: "midground",
    environment: "Forest",
    mood: "Day",
    seamless: true,
  });
  const [iconCfg, setIconCfg] = useState<IconConfig>({
    category: "Consumable",
    type: "Health Potion",
    rarity: "Common",
  });
  const [uiCfg, setUiCfg] = useState<UIConfig>({
    elementType: "Button",
    theme: "Fantasy",
    nineSlice: false,
  });
  const [vfxCfg, setVfxCfg] = useState<VFXConfig>({
    action: "Explosion",
    frameCount: "8",
    size: "64x64",
  });

  // Style Stack
  const [styleStack, setStyleStack] = useState<StyleStack>({
    artStyle: "pixel art",
    colorPalette: "vibrant",
    spriteSize: "32x32",
  });
  const [transparent, setTransparent] = useState(false);

  // Prompt (auto-generated but editable)
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isPromptEdited, setIsPromptEdited] = useState(false);

  // Model + generation
  const [selectedId, setSelectedId] = useState(MODELS[0].id);
  const [count, setCount] = useState(2);
  const [images, setImages] = useState<ImageState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initImage, setInitImage] = useState<string | null>(null);

  const selectedModel = MODELS.find((m) => m.id === selectedId) ?? MODELS[0];

  // Auto-rebuild the prompt whenever config/style changes (unless user edited manually)
  const autoPrompt = useCallback(
    () =>
      buildPrompt(
        assetType,
        tilesetCfg, spriteCfg, bgCfg, iconCfg, uiCfg, vfxCfg,
        styleStack, transparent,
      ),
    [assetType, tilesetCfg, spriteCfg, bgCfg, iconCfg, uiCfg, vfxCfg, styleStack, transparent],
  );

  useEffect(() => {
    if (!isPromptEdited) {
      setGeneratedPrompt(autoPrompt());
    }
  }, [autoPrompt, isPromptEdited]);

  const resetPrompt = () => {
    setIsPromptEdited(false);
    setGeneratedPrompt(autoPrompt());
  };

  // Resolve effective ratio for provider size options (prefer 1:1 square)
  const availableRatios =
    selectedModel.supportedRatios !== undefined
      ? ALL_RATIOS.filter((r) =>
          (selectedModel.supportedRatios as Ratio[]).includes(r.value),
        )
      : ALL_RATIOS;
  const effectiveRatio =
    availableRatios.find((r) => r.value === "1:1") ??
    availableRatios[0] ??
    ALL_RATIOS[0];

  const canGenerate = !isGenerating && generatedPrompt.trim().length > 0;

  const generate = async () => {
    if (!canGenerate || !selectedModel) return;

    const finalPrompt = generatedPrompt.trim();
    let initImgB64: string | null = null;
    let initImgMime: string | null = null;

    if (initImage && selectedModel.supportsImg2Img) {
      const parsed = parseDataUrl(initImage);
      initImgB64 = parsed.b64;
      initImgMime = parsed.mime;
    }

    console.log(finalPrompt);

    setIsGenerating(true);
    setImages(
      Array.from({ length: count }, () => ({ status: "loading" as const })),
    );

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - puter.js ships its own types but bundler moduleResolution may not resolve them
    const puter = (await import("@heyputer/puter.js")).default;

    const results = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const options: Record<string, any> = {
            provider: selectedModel.provider,
            model: selectedModel.puterModel,
          };

          if (selectedModel.provider === "openai-image-generation") {
            options.ratio = { w: effectiveRatio.w, h: effectiveRatio.h };
          } else if (selectedModel.provider === "together") {
            options.width = effectiveRatio.w;
            options.height = effectiveRatio.h;
            if (initImgB64) options.image_base64 = initImgB64;
          } else if (selectedModel.provider === "gemini") {
            options.ratio = { w: 1024, h: 1024 };
            if (initImgB64) {
              options.input_image = initImgB64;
              options.input_image_mime_type = initImgMime;
            }
          }
          // xAI: no size or img2img options supported

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imgEl = await (puter as any).ai.txt2img(finalPrompt, options);
          const url: string =
            imgEl instanceof HTMLImageElement ? imgEl.src : String(imgEl);
          return { index: i, state: { status: "done" as const, url } };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error occurred.";
          return { index: i, state: { status: "error" as const, message } };
        }
      }),
    );

    setImages((prev) => {
      const next = [...prev];
      for (const { index, state } of results) next[index] = state;
      return next;
    });
    setIsGenerating(false);
  };

  // Group models by provider for the grouped select
  const modelsByProvider = Object.entries(PROVIDER_LABELS).flatMap(
    ([providerId, providerLabel]) => {
      const models = MODELS.filter((m) => m.provider === providerId);
      return models.length > 0 ? [{ providerLabel, models }] : [];
    },
  );

  const setStyle = <K extends keyof StyleStack>(k: K, v: StyleStack[K]) =>
    setStyleStack((prev) => ({ ...prev, [k]: v }));

  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const gridColClass =
    cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  const hasImages = images.length > 0;

  return (
    <div className="flex h-full gap-4 overflow-hidden p-4">
      {/* Left: Controls */}
      <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto pb-4 px-2">

        {/* Asset type selector */}
        <div className="space-y-1.5">
          <Label>Asset Type</Label>
          <Select value={assetType} onValueChange={(v) => setAssetType(v as AssetType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPE_DEFS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  <span>{a.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{a.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="h-px bg-border" />

        {/* Per-asset configuration form */}
        {assetType === "tileset"    && <TilesetConfigForm    config={tilesetCfg} onChange={setTilesetCfg} />}
        {assetType === "sprite"     && <SpriteConfigForm     config={spriteCfg}  onChange={setSpriteCfg}  />}
        {assetType === "background" && <BackgroundConfigForm config={bgCfg}      onChange={setBgCfg}      />}
        {assetType === "icon"       && <IconConfigForm       config={iconCfg}    onChange={setIconCfg}    />}
        {assetType === "ui"         && <UIConfigForm         config={uiCfg}      onChange={setUiCfg}      />}
        {assetType === "vfx"        && <VFXConfigForm        config={vfxCfg}     onChange={setVfxCfg}     />}

        <div className="h-px bg-border" />

        {/* Style Stack */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Style Stack
        </p>
        <div className="space-y-1.5">
          <Label>Art Style</Label>
          <Select value={styleStack.artStyle} onValueChange={(v) => setStyle("artStyle", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ART_STYLES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Color Palette</Label>
          <Select value={styleStack.colorPalette} onValueChange={(v) => setStyle("colorPalette", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLOR_PALETTES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tile / Sprite Size</Label>
          <Select value={styleStack.spriteSize} onValueChange={(v) => setStyle("spriteSize", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SPRITE_SIZES.map((s) => (
                <SelectItem key={s} value={s}>{s}px</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
          <div className="space-y-0.5">
            <Label className="text-sm">Transparent Background</Label>
            <p className="text-[10px] text-muted-foreground">Remove background</p>
          </div>
          <Switch checked={transparent} onCheckedChange={setTransparent} />
        </div>

        <div className="h-px bg-border" />

        {/* Generated prompt — editable */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-prompt">Prompt</Label>
            {isPromptEdited && (
              <button
                onClick={resetPrompt}
                className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
          <textarea
            id="ai-prompt"
            className="flex min-h-24 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={generatedPrompt}
            onChange={(e) => {
              setGeneratedPrompt(e.target.value);
              setIsPromptEdited(true);
            }}
          />
        </div>

        {/* Reference image (img2img models only) */}
        {selectedModel.supportsImg2Img && (
          <ImageUpload
            label="Reference Image (Optional)"
            value={initImage}
            onChange={setInitImage}
          />
        )}

        <div className="h-px bg-border" />

        {/* Model + count */}
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelsByProvider.map(({ providerLabel, models }) => (
                <SelectGroup key={providerLabel}>
                  <SelectLabel>{providerLabel}</SelectLabel>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Number of images</Label>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {n === 1 ? "image" : "images"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={generate} disabled={!canGenerate} className="w-full">
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate"
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Powered by{" "}
          <a
            href="https://developer.puter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80"
          >
            Puter.js
          </a>
          . Images are generated using your Puter account credits.
        </p>
      </div>

      {/* Right: Image grid */}
      <div className="flex-1 overflow-y-auto">
        {hasImages ? (
          <div className={`grid ${gridColClass} gap-3`}>
            {images.map((state, i) => (
              <ImageCell key={i} state={state} index={i} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="select-none text-sm text-muted-foreground">
              Configure an asset type and click Generate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
export function AiAssets() {
  return <Generator />;
}
