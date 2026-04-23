import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type {
  TilesetConfig,
  SpriteConfig,
  BackgroundConfig,
  IconConfig,
  UIConfig,
  VFXConfig,
} from "@/types/integrations/ai-assets";
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
} from "../lib/constants";

export function TilesetConfigForm({
  config,
  onChange,
}: {
  config: TilesetConfig;
  onChange: (config: TilesetConfig) => void;
}) {
  const setValue = <K extends keyof TilesetConfig>(
    key: K,
    value: TilesetConfig[K],
  ) => onChange({ ...config, [key]: value });

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ai-tileset-tile-type">Tile Type</Label>
        <Select value={config.tileType} onValueChange={(value) => setValue("tileType", value)}>
          <SelectTrigger id="ai-tileset-tile-type" name="ai-tileset-tile-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_TILE_TYPES.map((tileType) => (
              <SelectItem key={tileType} value={tileType}>
                {tileType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-tileset-terrain">Terrain</Label>
        <Select value={config.terrain} onValueChange={(value) => setValue("terrain", value)}>
          <SelectTrigger id="ai-tileset-terrain" name="ai-tileset-terrain" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_TERRAINS.map((terrain) => (
              <SelectItem key={terrain} value={terrain}>
                {terrain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-tileset-transition">Transition To</Label>
        <Select value={config.transition} onValueChange={(value) => setValue("transition", value)}>
          <SelectTrigger id="ai-tileset-transition" name="ai-tileset-transition" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_TRANSITIONS.map((transition) => (
              <SelectItem key={transition} value={transition}>
                {transition}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-tileset-mask-mode">Autotile Mode</Label>
        <Select value={config.maskMode} onValueChange={(value) => setValue("maskMode", value)}>
          <SelectTrigger id="ai-tileset-mask-mode" name="ai-tileset-mask-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MASK_MODES.map((mode) => (
              <SelectItem key={mode.value} value={mode.value}>
                {mode.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-tileset-perspective">Perspective</Label>
        <Select value={config.perspective} onValueChange={(value) => setValue("perspective", value)}>
          <SelectTrigger id="ai-tileset-perspective" name="ai-tileset-perspective" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILESET_PERSPECTIVES.map((perspective) => (
              <SelectItem key={perspective} value={perspective}>
                {perspective}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="ai-tileset-seamless" className="text-sm">
          Seamless Tiling
        </Label>
        <Switch
          id="ai-tileset-seamless"
          name="ai-tileset-seamless"
          checked={config.seamless}
          onCheckedChange={(value) => setValue("seamless", value)}
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
  onChange: (config: SpriteConfig) => void;
}) {
  const setValue = <K extends keyof SpriteConfig>(
    key: K,
    value: SpriteConfig[K],
  ) => onChange({ ...config, [key]: value });
  const showDirection = !config.perspective.startsWith("side");

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ai-sprite-role">Role</Label>
        <Select value={config.role} onValueChange={(value) => setValue("role", value)}>
          <SelectTrigger id="ai-sprite-role" name="ai-sprite-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPRITE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-sprite-state">Animation State</Label>
        <Select value={config.animState} onValueChange={(value) => setValue("animState", value)}>
          <SelectTrigger id="ai-sprite-state" name="ai-sprite-state" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIM_STATES.map((animationState) => (
              <SelectItem key={animationState.value} value={animationState.value}>
                {animationState.value.charAt(0).toUpperCase() + animationState.value.slice(1)}
                <span className="ml-1 text-muted-foreground">({animationState.hint})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-sprite-perspective">Perspective</Label>
        <Select value={config.perspective} onValueChange={(value) => setValue("perspective", value)}>
          <SelectTrigger id="ai-sprite-perspective" name="ai-sprite-perspective" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPRITE_PERSPECTIVES.map((perspective) => (
              <SelectItem key={perspective} value={perspective}>
                {perspective.charAt(0).toUpperCase() + perspective.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showDirection && (
        <div className="space-y-1.5">
          <Label htmlFor="ai-sprite-direction">Direction</Label>
          <Select value={config.direction} onValueChange={(value) => setValue("direction", value)}>
            <SelectTrigger id="ai-sprite-direction" name="ai-sprite-direction" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPRITE_DIRECTIONS.map((direction) => (
                <SelectItem key={direction} value={direction}>
                  {direction}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ai-sprite-frame-count">Frame Count</Label>
        <Select value={config.frameCount} onValueChange={(value) => setValue("frameCount", value)}>
          <SelectTrigger id="ai-sprite-frame-count" name="ai-sprite-frame-count" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRAME_COUNTS.map((frameCount) => (
              <SelectItem key={frameCount} value={frameCount}>
                {frameCount} frames
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-sprite-proportion">Proportion Style</Label>
        <Select value={config.proportion} onValueChange={(value) => setValue("proportion", value)}>
          <SelectTrigger id="ai-sprite-proportion" name="ai-sprite-proportion" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROPORTIONS.map((proportion) => (
              <SelectItem key={proportion.value} value={proportion.value}>
                {proportion.label}
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
  onChange: (config: BackgroundConfig) => void;
}) {
  const setValue = <K extends keyof BackgroundConfig>(
    key: K,
    value: BackgroundConfig[K],
  ) => onChange({ ...config, [key]: value });

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ai-background-layer">Parallax Layer</Label>
        <Select value={config.layer} onValueChange={(value) => setValue("layer", value)}>
          <SelectTrigger id="ai-background-layer" name="ai-background-layer" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BG_LAYERS.map((layer) => (
              <SelectItem key={layer.value} value={layer.value}>
                {layer.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-background-environment">Environment</Label>
        <Select value={config.environment} onValueChange={(value) => setValue("environment", value)}>
          <SelectTrigger id="ai-background-environment" name="ai-background-environment" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BG_ENVIRONMENTS.map((environment) => (
              <SelectItem key={environment} value={environment}>
                {environment}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-background-mood">Mood / Time of Day</Label>
        <Select value={config.mood} onValueChange={(value) => setValue("mood", value)}>
          <SelectTrigger id="ai-background-mood" name="ai-background-mood" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BG_MOODS.map((mood) => (
              <SelectItem key={mood} value={mood}>
                {mood}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="ai-background-seamless" className="text-sm">
            Seamless Loop
          </Label>
          <p className="text-[10px] text-muted-foreground">Horizontal tiling</p>
        </div>
        <Switch
          id="ai-background-seamless"
          name="ai-background-seamless"
          checked={config.seamless}
          onCheckedChange={(value) => setValue("seamless", value)}
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
  onChange: (config: IconConfig) => void;
}) {
  const setValue = <K extends keyof IconConfig>(
    key: K,
    value: IconConfig[K],
  ) => onChange({ ...config, [key]: value });
  const typeOptions = ICON_TYPES[config.category] ?? [];

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ai-icon-category">Category</Label>
        <Select
          value={config.category}
          onValueChange={(value) =>
            onChange({
              ...config,
              category: value,
              type: ICON_TYPES[value]?.[0] ?? "",
            })
          }
        >
          <SelectTrigger id="ai-icon-category" name="ai-icon-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICON_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-icon-type">Type</Label>
        <Select value={config.type} onValueChange={(value) => setValue("type", value)}>
          <SelectTrigger id="ai-icon-type" name="ai-icon-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-icon-rarity">Rarity</Label>
        <Select value={config.rarity} onValueChange={(value) => setValue("rarity", value)}>
          <SelectTrigger id="ai-icon-rarity" name="ai-icon-rarity" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RARITIES.map((rarity) => (
              <SelectItem key={rarity} value={rarity}>
                {rarity}
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
  onChange: (config: UIConfig) => void;
}) {
  const setValue = <K extends keyof UIConfig>(key: K, value: UIConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ai-ui-element-type">Element Type</Label>
        <Select value={config.elementType} onValueChange={(value) => setValue("elementType", value)}>
          <SelectTrigger id="ai-ui-element-type" name="ai-ui-element-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_ELEMENT_TYPES.map((elementType) => (
              <SelectItem key={elementType} value={elementType}>
                {elementType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-ui-theme">Theme</Label>
        <Select value={config.theme} onValueChange={(value) => setValue("theme", value)}>
          <SelectTrigger id="ai-ui-theme" name="ai-ui-theme" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_THEMES.map((theme) => (
              <SelectItem key={theme} value={theme}>
                {theme}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="ai-ui-nine-slice" className="text-sm">
          Nine Slice
        </Label>
        <Switch
          id="ai-ui-nine-slice"
          name="ai-ui-nine-slice"
          checked={config.nineSlice}
          onCheckedChange={(value) => setValue("nineSlice", value)}
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
  onChange: (config: VFXConfig) => void;
}) {
  const setValue = <K extends keyof VFXConfig>(key: K, value: VFXConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ai-vfx-action">Action</Label>
        <Select value={config.action} onValueChange={(value) => setValue("action", value)}>
          <SelectTrigger id="ai-vfx-action" name="ai-vfx-action" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VFX_ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-vfx-frame-count">Frame Count</Label>
        <Select value={config.frameCount} onValueChange={(value) => setValue("frameCount", value)}>
          <SelectTrigger id="ai-vfx-frame-count" name="ai-vfx-frame-count" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VFX_FRAME_COUNTS.map((frameCount) => (
              <SelectItem key={frameCount} value={frameCount}>
                {frameCount}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-vfx-size">Frame Size</Label>
        <Select value={config.size} onValueChange={(value) => setValue("size", value)}>
          <SelectTrigger id="ai-vfx-size" name="ai-vfx-size" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VFX_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}