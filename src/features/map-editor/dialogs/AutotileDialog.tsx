import { useCallback, useMemo, useState } from "react";
import { Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import {
  AUTOTILE_CONFIG_VERSION,
  type AutotileConfig,
  type AutotilePatternSlotId,
  type AutotilePresetId,
  type AutotileTerrain,
  type AutotileTileRegion,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";
import { AutotilePatternTileCard } from "@/features/map-editor/components/autotile/AutotilePatternTileCard";
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import {
  AUTOTILE_PATTERN_SLOTS,
  AUTOTILE_PRESET_DEFINITIONS,
  buildPresetAutotileRules,
  getAutotilePresetDefinition,
} from "@/features/map-editor/lib/autotile-preset-rules";
import type {
  AutotileDialogProps,
  AutotileSelectionTarget,
} from "@/features/map-editor/types/dialogs";
import { generateAutotileTerrainId } from "@/utils/ids";

const DEFAULT_PRESET_ID: AutotilePresetId = "edges-corners";

const SETUP_STEPS = [
  {
    title: "1. Pick the tile you paint with",
    body: "Each terrain starts with one paint tile. This is the tile you select when using the autotile brush.",
  },
  {
    title: "2. Choose how detailed it should be",
    body: "Start with edges only, then add outside or inside corners if the terrain needs smoother transitions.",
  },
  {
    title: "3. Fill the visual pattern cards",
    body: "Each card shows the situation on the map. Click the matching tile in the tileset picker to assign it.",
  },
] as const;

function createEmptyAutotileConfig(): AutotileConfig {
  return {
    version: AUTOTILE_CONFIG_VERSION,
    preset: DEFAULT_PRESET_ID,
    terrains: [],
    rules: [],
  };
}

function normalizeTerrain(terrain: AutotileTerrain): AutotileTerrain {
  return {
    ...terrain,
    patternTiles: terrain.patternTiles ?? {},
  };
}

function cloneAutotileConfig(
  autotile: AutotileConfig | null | undefined,
): AutotileConfig {
  if (!autotile) {
    return createEmptyAutotileConfig();
  }

  const cloned = JSON.parse(JSON.stringify(autotile)) as AutotileConfig;

  return {
    version: cloned.version,
    preset: cloned.preset ?? DEFAULT_PRESET_ID,
    terrains: cloned.terrains.map(normalizeTerrain),
    rules: cloned.rules ?? [],
  };
}

function formatTileLabel(
  region: AutotileTileRegion | null,
  tileSize: number,
): string {
  if (!region) {
    return "No tile assigned";
  }

  return `Tile ${Math.round(region.sx / tileSize)},${Math.round(region.sy / tileSize)}`;
}

function getTargetTile(
  autotile: AutotileConfig,
  target: AutotileSelectionTarget | null,
): AutotileTileRegion | null {
  if (!target) {
    return null;
  }

  const terrain = autotile.terrains.find(
    (candidate) => candidate.id === target.terrainId,
  );

  if (!terrain) {
    return null;
  }

  if (target.type === "terrain") {
    return terrain.paletteTile;
  }

  return terrain.patternTiles?.[target.slotId] ?? null;
}

function countRequiredAssignments(
  terrain: AutotileTerrain,
  requiredSlots: AutotilePatternSlotId[],
): number {
  return requiredSlots.reduce((count, slotId) => {
    return terrain.patternTiles?.[slotId] ? count + 1 : count;
  }, 0);
}

function getSelectionInstructions(
  draft: AutotileConfig,
  target: AutotileSelectionTarget | null,
): string {
  if (!target) {
    return "Select a paint tile or pattern card, then click a tile in the picker.";
  }

  const terrain = draft.terrains.find(
    (candidate) => candidate.id === target.terrainId,
  );
  const terrainName = terrain?.name || "This terrain";

  if (target.type === "terrain") {
    return `Click a tile to use as the paint tile for ${terrainName}.`;
  }

  return `Click a tile to use for ${terrainName} -> ${AUTOTILE_PATTERN_SLOTS[target.slotId].label}.`;
}

function hasPatternAssignments(terrain: AutotileTerrain): boolean {
  return Object.values(terrain.patternTiles ?? {}).some(Boolean);
}

export function AutotileDialog({
  open,
  onOpenChange,
  onSave,
  tileset,
}: AutotileDialogProps) {
  const [enabled, setEnabled] = useState(() => Boolean(tileset.autotile));
  const [draft, setDraft] = useState<AutotileConfig>(() =>
    cloneAutotileConfig(tileset.autotile),
  );
  const [zoom, setZoom] = useState(1);
  const [selectionTarget, setSelectionTarget] =
    useState<AutotileSelectionTarget | null>(null);
  const [lastCanvasTile, setLastCanvasTile] =
    useState<AutotileTileRegion | null>(null);

  const presetDefinition = useMemo(
    () => getAutotilePresetDefinition(draft.preset),
    [draft.preset],
  );

  const requiredPatternDefinitions = useMemo(
    () =>
      presetDefinition.requiredSlots.map(
        (slotId) => AUTOTILE_PATTERN_SLOTS[slotId],
      ),
    [presetDefinition.requiredSlots],
  );

  const optionalPatternDefinitions = useMemo(
    () =>
      presetDefinition.optionalSlots.map(
        (slotId) => AUTOTILE_PATTERN_SLOTS[slotId],
      ),
    [presetDefinition.optionalSlots],
  );

  const highlightedTile = useMemo(
    () => getTargetTile(draft, selectionTarget) ?? lastCanvasTile,
    [draft, lastCanvasTile, selectionTarget],
  );

  const totalRequiredAssignments = useMemo(
    () => draft.terrains.length * presetDefinition.requiredSlots.length,
    [draft.terrains.length, presetDefinition.requiredSlots.length],
  );

  const assignedRequiredAssignments = useMemo(
    () =>
      draft.terrains.reduce(
        (count, terrain) =>
          count +
          countRequiredAssignments(terrain, presetDefinition.requiredSlots),
        0,
      ),
    [draft.terrains, presetDefinition.requiredSlots],
  );

  const hasLegacyRules = useMemo(
    () =>
      draft.rules.length > 0 &&
      draft.terrains.every((terrain) => !hasPatternAssignments(terrain)),
    [draft.rules.length, draft.terrains],
  );

  const handleCanvasTileSelect = useCallback(
    (tile: AutotileTileRegion) => {
      setLastCanvasTile(tile);

      if (!selectionTarget) {
        return;
      }

      setDraft((current) => ({
        ...current,
        terrains: current.terrains.map((terrain) => {
          if (terrain.id !== selectionTarget.terrainId) {
            return terrain;
          }

          if (selectionTarget.type === "terrain") {
            return {
              ...terrain,
              paletteTile: tile,
            };
          }

          return {
            ...terrain,
            patternTiles: {
              ...(terrain.patternTiles ?? {}),
              [selectionTarget.slotId]: tile,
            },
          };
        }),
      }));
    },
    [selectionTarget],
  );

  const handleAddTerrain = useCallback(() => {
    const terrainId = generateAutotileTerrainId();

    setDraft((current) => ({
      ...current,
      terrains: [
        ...current.terrains,
        {
          id: terrainId,
          name: `Terrain ${current.terrains.length + 1}`,
          paletteTile: null,
          patternTiles: {},
        },
      ],
    }));
    setSelectionTarget({ type: "terrain", terrainId });
  }, []);

  const handleRemoveTerrain = useCallback(
    (terrainId: AutotileTerrain["id"]) => {
      setDraft((current) => ({
        ...current,
        terrains: current.terrains.filter(
          (terrain) => terrain.id !== terrainId,
        ),
      }));
      setSelectionTarget((current) =>
        current?.terrainId === terrainId ? null : current,
      );
    },
    [],
  );

  const handlePresetChange = useCallback((preset: AutotilePresetId) => {
    setDraft((current) => ({
      ...current,
      preset,
    }));
    setSelectionTarget(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!enabled) {
      onSave(undefined);
      onOpenChange(false);
      return;
    }

    const compiledRules = buildPresetAutotileRules({
      preset: draft.preset,
      terrains: draft.terrains,
    });

    onSave({
      ...draft,
      version: AUTOTILE_CONFIG_VERSION,
      rules: compiledRules,
    });
    onOpenChange(false);
  }, [draft, enabled, onOpenChange, onSave]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[92vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Autotile Setup</DialogTitle>
          <DialogDescription>
            Build autotiles visually. Choose the tile you paint with, pick how
            much detail you want, then assign tiles for the edge and corner
            situations shown below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="autotile-enabled">
              Enable autotile for this tileset
            </Label>
            <p className="text-xs text-muted-foreground">
              Turn this off to remove the tileset-specific autotile setup.
            </p>
          </div>
          <Switch
            id="autotile-enabled"
            name="autotile-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)] overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Tileset Picker</h3>
                <p className="text-xs text-muted-foreground">
                  {getSelectionInstructions(draft, selectionTarget)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onMouseDown={() =>
                    setZoom((current) => Math.max(0.5, current - 0.5))
                  }
                >
                  <ZoomOut />
                </Button>
                <span className="w-10 text-center text-[11px] text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onMouseDown={() => setZoom((current) => current + 0.5)}
                >
                  <ZoomIn />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden min-h-0 flex-1">
              <TilesetCanvas
                assetId={tileset.assetId}
                tileSize={tileset.tileSize}
                zoom={zoom}
                onZoomChange={setZoom}
                selectedTile={highlightedTile}
                onTileSelect={handleCanvasTileSelect}
                selectionMode="single"
                className="h-full min-h-0"
              />
            </div>

            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {selectionTarget?.type === "terrain" &&
                "You are assigning the tile used when painting this terrain."}
              {selectionTarget?.type === "pattern" &&
                "You are assigning the visual tile shown on the selected pattern card."}
              {!selectionTarget &&
                "Choose a paint tile or a pattern card on the right, then click the matching tile here."}
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-medium text-foreground">
                    Setup Coverage
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {assignedRequiredAssignments} of {totalRequiredAssignments}{" "}
                    required pattern tiles assigned.
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {draft.terrains.length} terrain
                  {draft.terrains.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-foreground transition-[width]"
                  style={{
                    width:
                      totalRequiredAssignments === 0
                        ? "0%"
                        : `${(assignedRequiredAssignments / totalRequiredAssignments) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
              {hasLegacyRules && (
                <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <h3 className="text-sm font-medium text-foreground">
                    Existing rule setup detected
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This tileset already has a rule-based autotile setup. Saving
                    here converts it into the new visual builder and rewrites
                    the underlying generated rules.
                  </p>
                </section>
              )}

              <section className="rounded-xl border border-border p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-medium">How To Use It</h3>
                  <p className="text-xs text-muted-foreground">
                    The cards below describe the situations your terrain can run
                    into on the map. Match each card to the tile that should be
                    shown in that situation.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {SETUP_STEPS.map((step) => (
                    <div
                      key={step.title}
                      className="rounded-xl border border-border bg-muted/20 p-3"
                    >
                      <h4 className="text-xs font-medium text-foreground">
                        {step.title}
                      </h4>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-medium">Detail Level</h3>
                  <p className="text-xs text-muted-foreground">
                    Start simple and only choose the pattern situations you want
                    this tileset to support.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {AUTOTILE_PRESET_DEFINITIONS.map((preset) => {
                    const checked = draft.preset === preset.id;
                    const inputId = `autotile-preset-${preset.id}`;

                    return (
                      <label
                        key={preset.id}
                        htmlFor={inputId}
                        className={`flex cursor-pointer flex-col rounded-xl border p-3 transition-colors ${
                          checked
                            ? "border-foreground bg-secondary"
                            : "border-border bg-background hover:border-border-visible hover:bg-muted/20"
                        }`}
                      >
                        <input
                          id={inputId}
                          name="autotile-preset"
                          type="radio"
                          className="sr-only"
                          checked={checked}
                          onChange={() => handlePresetChange(preset.id)}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-medium text-foreground">
                            {preset.label}
                          </h4>
                          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                            {preset.requiredSlots.length} required
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {preset.description}
                        </p>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">Terrain Types</h3>
                    <p className="text-xs text-muted-foreground">
                      Create one terrain card for each paintable material in
                      this tileset, such as grass, water, or stone.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onMouseDown={handleAddTerrain}
                  >
                    <Plus />
                    Add Terrain
                  </Button>
                </div>

                <div className="flex flex-col gap-4">
                  {draft.terrains.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-5 text-xs text-muted-foreground">
                      Add a terrain to start. Then pick the tile you want to
                      paint with and assign the pattern cards that matter for
                      that terrain.
                    </div>
                  )}

                  {draft.terrains.map((terrain, index) => {
                    const assignedRequired = countRequiredAssignments(
                      terrain,
                      presetDefinition.requiredSlots,
                    );

                    return (
                      <div
                        key={terrain.id}
                        className="rounded-xl border border-border bg-muted/20 p-3"
                      >
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-medium text-foreground">
                              Terrain {index + 1}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {assignedRequired} of{" "}
                              {presetDefinition.requiredSlots.length} required
                              pattern tiles assigned for this terrain.
                            </p>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive"
                            aria-label={`Remove terrain ${terrain.name}`}
                            onMouseDown={() => handleRemoveTerrain(terrain.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`autotile-terrain-name-${terrain.id}`}
                            >
                              Terrain Name
                            </Label>
                            <Input
                              id={`autotile-terrain-name-${terrain.id}`}
                              name={`autotile-terrain-name-${terrain.id}`}
                              className="h-8 text-xs"
                              value={terrain.name}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  terrains: current.terrains.map((candidate) =>
                                    candidate.id === terrain.id
                                      ? {
                                          ...candidate,
                                          name: event.target.value,
                                        }
                                      : candidate,
                                  ),
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor={`autotile-terrain-paint-${terrain.id}`}
                            >
                              Paint Tile
                            </Label>
                            <div className="flex items-center gap-2">
                              {terrain.paletteTile && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onMouseDown={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      terrains: current.terrains.map(
                                        (candidate) =>
                                          candidate.id === terrain.id
                                            ? {
                                                ...candidate,
                                                paletteTile: null,
                                              }
                                            : candidate,
                                      ),
                                    }))
                                  }
                                >
                                  Clear
                                </Button>
                              )}
                              <Button
                                type="button"
                                id={`autotile-terrain-paint-${terrain.id}`}
                                name={`autotile-terrain-paint-${terrain.id}`}
                                variant={
                                  selectionTarget?.type === "terrain" &&
                                  selectionTarget.terrainId === terrain.id
                                    ? "default"
                                    : "outline"
                                }
                                size="xs"
                                onMouseDown={() =>
                                  setSelectionTarget({
                                    type: "terrain",
                                    terrainId: terrain.id,
                                  })
                                }
                              >
                                {terrain.paletteTile
                                  ? "Change Tile"
                                  : "Pick Tile"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          <p>
                            {formatTileLabel(
                              terrain.paletteTile,
                              tileset.tileSize,
                            )}
                          </p>
                          <p className="mt-1">
                            This is the tile you will select when painting with
                            the autotile brush.
                          </p>
                        </div>

                        <div className="mt-4 space-y-4">
                          <div>
                            <div className="mb-2">
                              <h5 className="text-xs font-medium text-foreground">
                                Required Pattern Tiles
                              </h5>
                              <p className="text-xs text-muted-foreground">
                                Fill these first so the terrain can react to the
                                most common map situations.
                              </p>
                            </div>
                            <div className="grid gap-3 xl:grid-cols-2">
                              {requiredPatternDefinitions.map((definition) => (
                                <AutotilePatternTileCard
                                  key={`${terrain.id}-${definition.id}`}
                                  buttonId={`autotile-pattern-${terrain.id}-${definition.id}`}
                                  buttonName={`autotile-pattern-${terrain.id}-${definition.id}`}
                                  definition={definition}
                                  isRequired
                                  isSelected={
                                    selectionTarget?.type === "pattern" &&
                                    selectionTarget.terrainId === terrain.id &&
                                    selectionTarget.slotId === definition.id
                                  }
                                  tile={
                                    terrain.patternTiles?.[definition.id] ??
                                    null
                                  }
                                  tileLabel={formatTileLabel(
                                    terrain.patternTiles?.[definition.id] ??
                                      null,
                                    tileset.tileSize,
                                  )}
                                  onClear={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      terrains: current.terrains.map(
                                        (candidate) =>
                                          candidate.id === terrain.id
                                            ? {
                                                ...candidate,
                                                patternTiles: {
                                                  ...(candidate.patternTiles ??
                                                    {}),
                                                  [definition.id]: null,
                                                },
                                              }
                                            : candidate,
                                      ),
                                    }))
                                  }
                                  onPick={() =>
                                    setSelectionTarget({
                                      type: "pattern",
                                      terrainId: terrain.id,
                                      slotId: definition.id,
                                    })
                                  }
                                />
                              ))}
                            </div>
                          </div>

                          {optionalPatternDefinitions.length > 0 && (
                            <div>
                              <div className="mb-2">
                                <h5 className="text-xs font-medium text-foreground">
                                  Optional Pattern Tiles
                                </h5>
                                <p className="text-xs text-muted-foreground">
                                  These refine the look further, but empty slots
                                  will fall back to the paint tile.
                                </p>
                              </div>
                              <div className="grid gap-3 xl:grid-cols-2">
                                {optionalPatternDefinitions.map(
                                  (definition) => (
                                    <AutotilePatternTileCard
                                      key={`${terrain.id}-${definition.id}`}
                                      buttonId={`autotile-pattern-${terrain.id}-${definition.id}`}
                                      buttonName={`autotile-pattern-${terrain.id}-${definition.id}`}
                                      definition={definition}
                                      isRequired={false}
                                      isSelected={
                                        selectionTarget?.type === "pattern" &&
                                        selectionTarget.terrainId ===
                                          terrain.id &&
                                        selectionTarget.slotId === definition.id
                                      }
                                      tile={
                                        terrain.patternTiles?.[definition.id] ??
                                        null
                                      }
                                      tileLabel={formatTileLabel(
                                        terrain.patternTiles?.[definition.id] ??
                                          null,
                                        tileset.tileSize,
                                      )}
                                      onClear={() =>
                                        setDraft((current) => ({
                                          ...current,
                                          terrains: current.terrains.map(
                                            (candidate) =>
                                              candidate.id === terrain.id
                                                ? {
                                                    ...candidate,
                                                    patternTiles: {
                                                      ...(candidate.patternTiles ??
                                                        {}),
                                                      [definition.id]: null,
                                                    },
                                                  }
                                                : candidate,
                                          ),
                                        }))
                                      }
                                      onPick={() =>
                                        setSelectionTarget({
                                          type: "pattern",
                                          terrainId: terrain.id,
                                          slotId: definition.id,
                                        })
                                      }
                                    />
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onMouseDown={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onMouseDown={handleSave}>
            Save Autotile Setup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
