import { useCallback, useMemo, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  AUTOTILE_CONFIG_VERSION,
  type AutotileConfig,
  type AutotilePatternSlotId,
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
import { AutotilePatternGroupCard } from "@/features/map-editor/components/autotile/AutotilePatternGroupCard";
import { AutotileTerrainSidebar } from "@/features/map-editor/components/autotile/AutotileTerrainSidebar";
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import { useAssetImage } from "@/features/map-editor/hooks/use-asset-image";
import {
  assignTileToSelectionTarget,
  cloneAutotileConfig,
  countConfiguredAssignments,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
  getSelectionInstructions,
  getTargetTile,
  hasPatternAssignments,
} from "@/features/map-editor/lib/autotile-dialog";
import {
  AUTOTILE_PRESET_DEFINITIONS,
  buildPresetAutotileRules,
  getAutotilePresetDefinition,
} from "@/features/map-editor/lib/autotile-preset-rules";
import type {
  AutotileDialogProps,
  AutotileSelectionTarget,
} from "@/features/map-editor/types/dialogs";
import { generateAutotileTerrainId } from "@/utils/ids";

export function AutotileDialog({
  open,
  onOpenChange,
  onSave,
  tileset,
}: AutotileDialogProps) {
  const [draft, setDraft] = useState<AutotileConfig>(() =>
    cloneAutotileConfig(tileset.autotile),
  );
  const [activeTerrainId, setActiveTerrainId] = useState<
    AutotileTerrain["id"] | null
  >(() => cloneAutotileConfig(tileset.autotile).terrains[0]?.id ?? null);
  const [zoom, setZoom] = useState(1);
  const [selectionTarget, setSelectionTarget] =
    useState<AutotileSelectionTarget | null>(null);
  const tilesetImage = useAssetImage(tileset.assetId);

  const presetDefinition = useMemo(
    () => getAutotilePresetDefinition(draft.preset),
    [draft.preset],
  );

  const activePatternSlotIds = useMemo(
    () => getAutotileActiveSlotIds(draft.preset),
    [draft.preset],
  );

  const visiblePatternGroups = useMemo(
    () => getAutotileAssignmentGroups(draft.preset),
    [draft.preset],
  );

  const highlightedTile = useMemo(
    () => getTargetTile(draft, selectionTarget),
    [draft, selectionTarget],
  );

  const activeTerrain = useMemo(
    () =>
      draft.terrains.find((candidate) => candidate.id === activeTerrainId) ??
      null,
    [activeTerrainId, draft.terrains],
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
          countConfiguredAssignments(terrain, presetDefinition.requiredSlots),
        0,
      ),
    [draft.terrains, presetDefinition.requiredSlots],
  );

  const activeRequiredAssignments = useMemo(
    () =>
      activeTerrain
        ? countConfiguredAssignments(
            activeTerrain,
            presetDefinition.requiredSlots,
          )
        : 0,
    [activeTerrain, presetDefinition.requiredSlots],
  );

  const hasLegacyRules = useMemo(
    () =>
      draft.rules.length > 0 &&
      draft.terrains.every((terrain) => !hasPatternAssignments(terrain)),
    [draft.rules.length, draft.terrains],
  );

  const handleSelectTarget = useCallback((target: AutotileSelectionTarget) => {
    setActiveTerrainId(target.terrainId);
    setSelectionTarget(target);
  }, []);

  const handleCanvasTileSelect = useCallback(
    (tile: AutotileTileRegion) => {
      if (!selectionTarget) {
        return;
      }

      setDraft((current) => ({
        ...current,
        terrains: assignTileToSelectionTarget(
          current.terrains,
          selectionTarget,
          tile,
        ),
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
    setActiveTerrainId(terrainId);
    setSelectionTarget({ type: "terrain", terrainId });
  }, []);

  const handleRemoveTerrain = useCallback(
    (terrainId: AutotileTerrain["id"]) => {
      const remainingTerrains = draft.terrains.filter(
        (terrain) => terrain.id !== terrainId,
      );

      setDraft((current) => ({
        ...current,
        terrains: current.terrains.filter(
          (terrain) => terrain.id !== terrainId,
        ),
      }));

      if (
        activeTerrainId === terrainId ||
        !remainingTerrains.some((terrain) => terrain.id === activeTerrainId)
      ) {
        setActiveTerrainId(remainingTerrains[0]?.id ?? null);
      }

      setSelectionTarget((current) =>
        current?.terrainId === terrainId ? null : current,
      );
    },
    [activeTerrainId, draft.terrains],
  );

  const handlePresetChange = useCallback((preset: AutotileConfig["preset"]) => {
    setDraft((current) => ({
      ...current,
      preset,
    }));
    setSelectionTarget(null);
  }, []);

  const handleSelectRule = useCallback((terrainId: AutotileTerrain["id"]) => {
    setActiveTerrainId(terrainId);
    setSelectionTarget(null);
  }, []);

  const handleTerrainNameChange = useCallback(
    (value: string) => {
      if (!activeTerrainId) {
        return;
      }

      setDraft((current) => ({
        ...current,
        terrains: current.terrains.map((candidate) =>
          candidate.id === activeTerrainId
            ? {
                ...candidate,
                name: value,
              }
            : candidate,
        ),
      }));
    },
    [activeTerrainId],
  );

  const handleClearPaintTile = useCallback(() => {
    if (!activeTerrainId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      terrains: assignTileToSelectionTarget(
        current.terrains,
        {
          type: "terrain",
          terrainId: activeTerrainId,
        },
        null,
      ),
    }));
  }, [activeTerrainId]);

  const handleSelectPatternSlot = useCallback(
    (slotId: AutotilePatternSlotId) => {
      if (!activeTerrainId) {
        return;
      }

      handleSelectTarget({
        type: "pattern",
        terrainId: activeTerrainId,
        slotId,
      });
    },
    [activeTerrainId, handleSelectTarget],
  );

  const handleClearPatternSlot = useCallback(
    (slotId: AutotilePatternSlotId) => {
      if (!activeTerrainId) {
        return;
      }

      setDraft((current) => ({
        ...current,
        terrains: assignTileToSelectionTarget(
          current.terrains,
          {
            type: "pattern",
            terrainId: activeTerrainId,
            slotId,
          },
          null,
        ),
      }));
    },
    [activeTerrainId],
  );

  const handleSave = useCallback(() => {
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
  }, [draft, onOpenChange, onSave]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[92vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Autotile Setup</DialogTitle>
          <DialogDescription>
            Build autotiles visually. Create a rule, choose its paint tile, then
            assign the edge and corner blocks that should appear around that
            terrain.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] overflow-hidden">
          <AutotileTerrainSidebar
            terrains={draft.terrains}
            activeTerrainId={activeTerrainId}
            configuredSlotIds={presetDefinition.requiredSlots}
            onCreateRule={handleAddTerrain}
            onDeleteRule={handleRemoveTerrain}
            onSelectRule={handleSelectRule}
          />

          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)] overflow-hidden">
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
                  "You are assigning the center paint tile for the selected rule."}
                {selectionTarget?.type === "pattern" &&
                  "You are assigning the pattern block that is currently highlighted on the right."}
                {!selectionTarget &&
                  "Select the center paint tile or a pattern block on the right, then click a tile here to assign it."}
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-medium text-foreground">
                      Setup Coverage
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {assignedRequiredAssignments} of{" "}
                      {totalRequiredAssignments} required pattern blocks
                      assigned.
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {draft.terrains.length} rule
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
                      This tileset already has a rule-based autotile setup.
                      Saving here converts it into the new visual builder and
                      rewrites the generated rules stored on the tileset.
                    </p>
                  </section>
                )}

                <section
                  role="region"
                  aria-label="Rule editor"
                  className="rounded-xl border border-border p-3"
                >
                  <div className="mb-3">
                    <h3 className="text-sm font-medium">Rule Editor</h3>
                    <p className="text-xs text-muted-foreground">
                      {activeTerrain
                        ? `${activeRequiredAssignments} of ${presetDefinition.requiredSlots.length} required blocks configured for this rule.`
                        : "Select a rule in the sidebar to start editing it."}
                    </p>
                  </div>

                  {!activeTerrain ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-5 text-xs text-muted-foreground">
                      Create a rule on the left, then use the center paint tile
                      and surrounding pattern blocks to configure it.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`autotile-terrain-name-${activeTerrain.id}`}
                        >
                          Terrain Name
                        </Label>
                        <Input
                          id={`autotile-terrain-name-${activeTerrain.id}`}
                          name={`autotile-terrain-name-${activeTerrain.id}`}
                          className="h-8 w-full text-xs"
                          placeholder="i.e. Land to Water"
                          value={activeTerrain.name}
                          onChange={(event) =>
                            handleTerrainNameChange(event.target.value)
                          }
                        />
                      </div>

                      <div className="mb-3">
                        <h4 className="text-sm font-medium">Detail Level</h4>
                        <p className="text-xs text-muted-foreground">
                          Start simple and only choose the pattern situations
                          you want this tileset to support.
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
                                <h5 className="text-xs font-medium text-foreground">
                                  {preset.label}
                                </h5>
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

                      <div className="space-y-4">
                        {visiblePatternGroups.map((group) => (
                          <AutotilePatternGroupCard
                            key={`${activeTerrain.id}-${group.id}`}
                            group={group}
                            terrain={activeTerrain}
                            tilesetImage={tilesetImage}
                            activeSlotIds={activePatternSlotIds}
                            selectionTarget={selectionTarget}
                            paintTile={activeTerrain.paletteTile}
                            onSelectSlot={handleSelectPatternSlot}
                            onClearSlot={handleClearPatternSlot}
                            onSelectPaintTile={() =>
                              handleSelectTarget({
                                type: "terrain",
                                terrainId: activeTerrain.id,
                              })
                            }
                            onClearPaintTile={handleClearPaintTile}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
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
