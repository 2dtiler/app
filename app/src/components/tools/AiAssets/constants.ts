import type { ModelDef, RatioDef } from "./types";

export const MODELS: ModelDef[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: "gpt-image-1.5",
    label: "GPT Image 1.5 (latest)",
    provider: "openai",
    apiModel: "gpt-image-1.5",
    supportsImg2Img: true,
  },
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    provider: "openai",
    apiModel: "gpt-image-1",
    supportsImg2Img: true,
  },
  {
    id: "gpt-image-1-mini",
    label: "GPT Image 1 Mini (fast)",
    provider: "openai",
    apiModel: "gpt-image-1-mini",
    supportsImg2Img: true,
  },
  // ── Google Gemini ────────────────────────────────────────────────────────
  {
    id: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image (4K, thinking)",
    provider: "gemini",
    apiModel: "gemini-3-pro-image-preview",
    supportsImg2Img: true,
  },
  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image (fast)",
    provider: "gemini",
    apiModel: "gemini-2.5-flash-image",
    supportsImg2Img: true,
  },
  // ── xAI ─────────────────────────────────────────────────────────────────
  {
    id: "aurora",
    label: "Aurora (xAI)",
    provider: "xai",
    apiModel: "aurora",
    supportsImg2Img: false,
  },
  // ── Together AI ──────────────────────────────────────────────────────────
  {
    id: "flux-1.1-pro",
    label: "FLUX 1.1 Pro (Together)",
    provider: "together",
    apiModel: "black-forest-labs/FLUX.1.1-pro",
    supportsImg2Img: false,
  },
  {
    id: "flux-schnell-free",
    label: "FLUX.1 Schnell Free (Together)",
    provider: "together",
    apiModel: "black-forest-labs/FLUX.1-schnell-Free",
    supportsImg2Img: false,
  },
];

/** Provider display names for grouping the model select */
export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  xai: "xAI",
  together: "Together AI",
};

export const ALL_RATIOS: RatioDef[] = [
  { value: "1:1", label: "Square (1:1)", w: 1024, h: 1024 },
  { value: "4:3", label: "Landscape (4:3)", w: 1024, h: 768 },
  { value: "16:9", label: "Wide (16:9)", w: 1280, h: 720 },
  { value: "3:4", label: "Portrait (3:4)", w: 768, h: 1024 },
];

export const COUNT_OPTIONS = [1, 2];

// Asset type definitions
export const ASSET_TYPE_DEFS: {
  value: import("./types").AssetType;
  label: string;
  description: string;
}[] = [
  {
    value: "tileset",
    label: "Tileset",
    description: "Grid-based environment tiles",
  },
  {
    value: "sprite",
    label: "Sprite Sheet",
    description: "Animated character frames",
  },
  {
    value: "background",
    label: "Background",
    description: "Parallax scene layers",
  },
  { value: "icon", label: "Item Icon", description: "Inventory & skill icons" },
  { value: "ui", label: "UI Element", description: "Buttons, panels & HUD" },
  { value: "vfx", label: "VFX", description: "Effects & particle sprites" },
];

// Style Stack options
export const ART_STYLES = [
  { value: "pixel art", label: "Pixel Art" },
  { value: "vector art with clean lines", label: "Vector" },
  { value: "hand-painted", label: "Hand-Painted" },
  { value: "cel-shaded", label: "Cel-Shaded" },
  { value: "watercolor", label: "Watercolor" },
];

export const COLOR_PALETTES = [
  { value: "vibrant", label: "Vibrant" },
  { value: "pastel", label: "Pastel" },
  { value: "muted and gritty", label: "Muted / Gritty" },
  { value: "monochromatic", label: "Monochromatic" },
  { value: "neon", label: "Neon" },
  { value: "warm earth tones", label: "Earth Tones" },
];

export const SPRITE_SIZES = ["16x16", "32x32", "64x64", "128x128"];

// Tileset options
export const TILESET_TILE_TYPES = [
  "Ground",
  "Wall",
  "Object / Prop",
  "Path",
  "Liquid",
];
export const TILESET_TERRAINS = [
  "Grass",
  "Dirt",
  "Sand",
  "Snow",
  "Stone",
  "Cobblestone",
  "Lava",
  "Water",
  "Ice",
  "Forest Floor",
  "Mud",
  "Marble",
];
export const TILESET_TRANSITIONS = [
  "None",
  "Grass",
  "Dirt",
  "Sand",
  "Snow",
  "Stone",
  "Lava",
  "Water",
  "Ice",
];
export const MASK_MODES = [
  { value: "seamless 47-tile blob", label: "47-Tile Blob (organic terrain)" },
  { value: "16-tile corner mask", label: "16-Tile Corner (paths & boxes)" },
  { value: "Wang tile", label: "Wang Tiles (non-periodic)" },
  { value: "dual grid", label: "Dual Grid (biome blending)" },
];
export const TILESET_PERSPECTIVES = ["Top-down", "Isometric 2:1"];

// Sprite options
export const SPRITE_ROLES = [
  "Hero / Player",
  "NPC",
  "Enemy",
  "Monster",
  "Boss",
];
export const ANIM_STATES = [
  { value: "idle", hint: "2–4 frames, looping" },
  { value: "walk", hint: "4–8 frames, looping" },
  { value: "run", hint: "8–12 frames, looping" },
  { value: "attack", hint: "5–10 frames, one-shot" },
  { value: "jump", hint: "3–5 frames, one-shot" },
  { value: "hurt", hint: "2–4 frames, one-shot" },
  { value: "die", hint: "4–8 frames, one-shot" },
];
export const SPRITE_PERSPECTIVES = [
  "side-view",
  "top-down 4-directional",
  "top-down 8-directional",
  "isometric",
];
export const SPRITE_DIRECTIONS = [
  "South",
  "South-West",
  "West",
  "North-West",
  "North",
  "North-East",
  "East",
  "South-East",
];
export const FRAME_COUNTS = ["2", "4", "6", "8", "10", "12"];
export const PROPORTIONS = [
  { value: "chibi / super-deformed", label: "Chibi (large head, expressive)" },
  { value: "semi-realistic", label: "Semi-Realistic" },
  { value: "realistic proportions", label: "Realistic" },
];

// Background options
export const BG_LAYERS = [
  { value: "foreground", label: "Foreground (fast scroll)" },
  { value: "midground", label: "Midground (standard)" },
  { value: "far / skybox", label: "Far / Skybox (slow)" },
];
export const BG_ENVIRONMENTS = [
  "Forest",
  "City",
  "Mountains",
  "Space",
  "Desert",
  "Ocean",
  "Cave / Underground",
  "Fantasy Castle",
  "Sci-fi Station",
  "Ruins",
  "Arctic",
];
export const BG_MOODS = [
  "Day",
  "Night",
  "Dusk",
  "Dawn",
  "Spooky",
  "Mystical",
  "Stormy",
  "Post-Apocalyptic",
];

// Icon options
export const ICON_CATEGORIES = [
  "Consumable",
  "Weapon",
  "Armor / Accessory",
  "Resource",
  "Skill / Status",
];
export const ICON_TYPES: Record<string, string[]> = {
  Consumable: [
    "Health Potion",
    "Mana Elixir",
    "Herb",
    "Food",
    "Scroll",
    "Bomb",
  ],
  Weapon: ["Sword", "Axe", "Bow", "Staff", "Dagger", "Spear", "Wand", "Shield"],
  "Armor / Accessory": [
    "Helmet",
    "Chest Armor",
    "Gauntlets",
    "Boots",
    "Ring",
    "Amulet",
    "Cape",
  ],
  Resource: ["Ore", "Wood", "Gem", "Monster Drop", "Crafting Material", "Coin"],
  "Skill / Status": [
    "Fire Spell",
    "Lightning Spell",
    "Poison",
    "Haste",
    "Shield Buff",
    "Heal",
  ],
};
export const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

// UI options
export const UI_ELEMENT_TYPES = [
  "Button",
  "Panel / Dialog Box",
  "Health Bar",
  "Mana Bar",
  "Inventory Slot",
  "Cursor",
  "Tooltip Box",
  "Menu Frame",
];
export const UI_THEMES = [
  "Fantasy",
  "Sci-fi",
  "Minimal / Flat",
  "Wooden",
  "Stone",
  "Metal",
  "Dark / Gothic",
];

// VFX options
export const VFX_ACTIONS = [
  "Explosion",
  "Fire",
  "Magic Spell",
  "Smoke",
  "Water Splash",
  "Lightning",
  "Poison Cloud",
  "Ice Shard",
  "Heal Glow",
  "Dust Puff",
];
export const VFX_FRAME_COUNTS = ["4", "6", "8", "12", "16"];
export const VFX_SIZES = ["32x32", "64x64", "128x128"];
