import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TilesetConfig,
  SpriteConfig,
  BackgroundConfig,
  IconConfig,
  UIConfig,
  VFXConfig,
} from "./types";
import {
  TILESET_TILE_TYPES,
  TILESET_TERRAINS,
  TILESET_TRANSITIONS,
  MASK_MODES,
  TILESET_PERSPECTIVES,
  SPRITE_ROLES,
  ANIM_STATES,
  SPRITE_PERSPECTIVES,
  SPRITE_DIRECTIONS,
  FRAME_COUNTS,
  PROPORTIONS,
  BG_LAYERS,
  BG_ENVIRONMENTS,
  BG_MOODS,
  ICON_CATEGORIES,
  ICON_TYPES,
  RARITIES,
  UI_ELEMENT_TYPES,
  UI_THEMES,
  VFX_ACTIONS,
  VFX_FRAME_COUNTS,
  VFX_SIZES,
} from "./constants";

export function TilesetConfigForm({
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
        <Select
          value={config.tileType}
          onValueChange={(v) => set("tileType", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_TILE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Terrain</Label>
        <Select value={config.terrain} onValueChange={(v) => set("terrain", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_TERRAINS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Transition To</Label>
        <Select
          value={config.transition}
          onValueChange={(v) => set("transition", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_TRANSITIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Autotile Mode</Label>
        <Select
          value={config.maskMode}
          onValueChange={(v) => set("maskMode", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MASK_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Perspective</Label>
        <Select
          value={config.perspective}
          onValueChange={(v) => set("perspective", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_PERSPECTIVES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label className="text-sm">Seamless Tiling</Label>
        <Switch
          checked={config.seamless}
          onCheckedChange={(v) => set("seamless", v)}
        />
      </div>
    </>
  );
}

export function SpriteConfigForm({
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
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPRITE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Animation State</Label>
        <Select
          value={config.animState}
          onValueChange={(v) => set("animState", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
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
        <Select
          value={config.perspective}
          onValueChange={(v) => set("perspective", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
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
          <Select
            value={config.direction}
            onValueChange={(v) => set("direction", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPRITE_DIRECTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Frame Count</Label>
        <Select
          value={config.frameCount}
          onValueChange={(v) => set("frameCount", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRAME_COUNTS.map((f) => (
              <SelectItem key={f} value={f}>
                {f} frames
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Proportion Style</Label>
        <Select
          value={config.proportion}
          onValueChange={(v) => set("proportion", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROPORTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function BackgroundConfigForm({
  config,
  onChange,
}: {
  config: BackgroundConfig;
  onChange: (c: BackgroundConfig) => void;
}) {
  const set = <K extends keyof BackgroundConfig>(
    k: K,
    v: BackgroundConfig[K],
  ) => onChange({ ...config, [k]: v });
  return (
    <>
      <div className="space-y-1.5">
        <Label>Parallax Layer</Label>
        <Select value={config.layer} onValueChange={(v) => set("layer", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BG_LAYERS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Environment</Label>
        <Select
          value={config.environment}
          onValueChange={(v) => set("environment", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BG_ENVIRONMENTS.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Mood / Time of Day</Label>
        <Select value={config.mood} onValueChange={(v) => set("mood", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BG_MOODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm">Seamless Loop</Label>
          <p className="text-[10px] text-muted-foreground">Horizontal tiling</p>
        </div>
        <Switch
          checked={config.seamless}
          onCheckedChange={(v) => set("seamless", v)}
        />
      </div>
    </>
  );
}

export function IconConfigForm({
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
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICON_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={config.type} onValueChange={(v) => set("type", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Rarity</Label>
        <Select value={config.rarity} onValueChange={(v) => set("rarity", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RARITIES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function UIConfigForm({
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
        <Select
          value={config.elementType}
          onValueChange={(v) => set("elementType", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_ELEMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Theme</Label>
        <Select value={config.theme} onValueChange={(v) => set("theme", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_THEMES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm">9-Slice Ready</Label>
          <p className="text-[10px] text-muted-foreground">
            Fixed corners, scalable edges
          </p>
        </div>
        <Switch
          checked={config.nineSlice}
          onCheckedChange={(v) => set("nineSlice", v)}
        />
      </div>
    </>
  );
}

export function VFXConfigForm({
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
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VFX_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Frame Count</Label>
        <Select
          value={config.frameCount}
          onValueChange={(v) => set("frameCount", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VFX_FRAME_COUNTS.map((f) => (
              <SelectItem key={f} value={f}>
                {f} frames
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Frame Size</Label>
        <Select value={config.size} onValueChange={(v) => set("size", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VFX_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
