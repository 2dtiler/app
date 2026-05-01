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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AutotilePatternGroupCard } from "@/features/map-editor/components/autotile/AutotilePatternGroupCard";
import { AutotilePatternTileCard } from "@/features/map-editor/components/autotile/AutotilePatternTileCard";
import { AutotileTerrainSidebar } from "@/features/map-editor/components/autotile/AutotileTerrainSidebar";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import { AutotileNamedWangEditor } from "@/features/map-editor/components/autotile/AutotileNamedWangEditor";
import { AutotileWangPatternEditor } from "@/features/map-editor/components/autotile/AutotileWangPatternEditor";
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import { useAssetImage } from "@/features/map-editor/hooks/use-asset-image";
import {
  assignTileToSelectionTarget,
  cloneAutotileConfig,
  countConfiguredAssignments,
  createDefaultWangSet,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
  getSelectionInstructions,
  getTargetTile,
  hasPatternAssignments,
} from "@/features/map-editor/lib/autotile-dialog";
import { useAutotileNamedWangEditor } from "@/features/map-editor/hooks/use-autotile-named-wang-editor";
import {
  AUTOTILE_PRESET_DEFINITIONS,
  buildPresetAutotileRules,
  getAutotilePresetCardGroups,
  getAutotilePresetDefinition,
  getAutotilePresetSlots,
} from "@/features/map-editor/lib/autotile-preset-rules";
import type {
  AutotileDialogProps,
  AutotileSelectionTarget,
} from "@/features/map-editor/types/dialogs";
import { generateAutotileTerrainId } from "@/utils/ids";
import { cn } from "@/utils/cn";

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

  const isNamedWangPreset = presetDefinition.editorLayout === "wang-named";

  const activePatternSlotIds = useMemo(
    () => getAutotileActiveSlotIds(draft.preset),
    [draft.preset],
  );

  const activePatternDefinitions = useMemo(
    () => getAutotilePresetSlots(draft.preset),
    [draft.preset],
  );

  const activePatternDefinitionMap = useMemo(
    () =>
      new Map(
        activePatternDefinitions.map((definition) => [
          definition.id,
          definition,
        ]),
      ),
    [activePatternDefinitions],
  );

  const activePatternCardGroups = useMemo(
    () => getAutotilePresetCardGroups(draft.preset),
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

  const defaultOpenPatternCardGroupIds = useMemo(() => {
    if (presetDefinition.editorLayout !== "cards" || !activeTerrain) {
      return [] as string[];
    }

    const incompleteGroupIds = activePatternCardGroups
      .filter(
        (group) =>
          countConfiguredAssignments(activeTerrain, group.slotIds) <
          group.slotIds.length,
      )
      .slice(0, 4)
      .map((group) => group.id);

    return incompleteGroupIds.length > 0
      ? incompleteGroupIds
      : activePatternCardGroups.slice(0, 4).map((group) => group.id);
  }, [activePatternCardGroups, activeTerrain, presetDefinition.editorLayout]);

  const handleSelectTarget = useCallback((target: AutotileSelectionTarget) => {
    if (target.type === "terrain" || target.type === "pattern") {
      setActiveTerrainId(target.terrainId);
    }
    setSelectionTarget(target);
  }, []);

  const {
    activeWangSetId,
    setActiveWangSetId,
    namedWangSetCount,
    namedWangColorCount,
    namedWangTileCount,
    handleAddWangSet,
    handleDeleteWangSet,
    handleSelectWangSet,
    handleUpdateWangSetName,
    handleUpdateWangSetType,
    handleSelectWangSetTile,
    handleClearWangSetTile,
    handleAddWangColor,
    handleDeleteWangColor,
    handleUpdateWangColorName,
    handleUpdateWangColorValue,
    handleUpdateWangColorProbability,
    handleSelectWangColorTile,
    handleClearWangColorTile,
    handleAddWangTile,
    handleDeleteWangTile,
    handleSelectWangTile,
    handleClearWangTile,
    handleUpdateWangTileProbability,
    handleUpdateWangTileColor,
  } = useAutotileNamedWangEditor({
    draft,
    setDraft,
    onSelectTarget: handleSelectTarget,
    onClearSelectionTarget: () => setSelectionTarget(null),
  });

  const handleCanvasTileSelect = useCallback(
    (tile: AutotileTileRegion) => {
      if (!selectionTarget) {
        return;
      }

      setDraft((current) => ({
        ...assignTileToSelectionTarget(current, selectionTarget, tile),
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
        current &&
        (current.type === "terrain" || current.type === "pattern") &&
        current.terrainId === terrainId
          ? null
          : current,
      );
    },
    [activeTerrainId, draft.terrains],
  );

  const handlePresetChange = useCallback(
    (preset: AutotileConfig["preset"]) => {
      const defaultWangSet =
        preset === "wang-named-colors" && !draft.wangSets?.length
          ? createDefaultWangSet(1)
          : null;

      setDraft((current) => ({
        ...current,
        preset,
        wangSets: defaultWangSet ? [defaultWangSet] : current.wangSets,
      }));
      if (defaultWangSet) {
        setActiveWangSetId(defaultWangSet.id);
      }
      setSelectionTarget(null);
    },
    [draft.wangSets?.length],
  );

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
      ...assignTileToSelectionTarget(
        current,
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
        ...assignTileToSelectionTarget(
          current,
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
    const compiledRules = isNamedWangPreset
      ? []
      : buildPresetAutotileRules({
          preset: draft.preset,
          terrains: draft.terrains,
        });

    onSave({
      ...draft,
      version: AUTOTILE_CONFIG_VERSION,
      terrains: isNamedWangPreset ? [] : draft.terrains,
      rules: compiledRules,
    });
    onOpenChange(false);
  }, [draft, isNamedWangPreset, onOpenChange, onSave]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[92vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Autotile Setup</DialogTitle>
          <DialogDescription>
            {isNamedWangPreset
              ? "Configure Tiled-compatible Wang sets with named colors, palette tiles, and tile assignments."
              : "Build autotiles visually. Create a rule, choose its paint tile, then assign the pattern tiles that should appear around that terrain."}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-4 overflow-hidden",
            isNamedWangPreset
              ? "lg:grid-cols-[minmax(0,1fr)]"
              : "lg:grid-cols-[16rem_minmax(0,1fr)]",
          )}
        >
          {!isNamedWangPreset && (
            <AutotileTerrainSidebar
              terrains={draft.terrains}
              activeTerrainId={activeTerrainId}
              configuredSlotIds={presetDefinition.requiredSlots}
              onCreateRule={handleAddTerrain}
              onDeleteRule={handleRemoveTerrain}
              onSelectRule={handleSelectRule}
            />
          )}

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
                    id="autotile-picker-zoom-out"
                    name="autotile-picker-zoom-out"
                    aria-label="Zoom out tileset picker"
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
                    id="autotile-picker-zoom-in"
                    name="autotile-picker-zoom-in"
                    aria-label="Zoom in tileset picker"
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
                {isNamedWangPreset
                  ? getSelectionInstructions(draft, selectionTarget)
                  : selectionTarget?.type === "terrain"
                    ? "You are assigning the center paint tile for the selected rule."
                    : selectionTarget?.type === "pattern"
                      ? "You are assigning the pattern block that is currently highlighted on the right."
                      : "Select the center paint tile or a pattern block on the right, then click a tile here to assign it."}
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-medium text-foreground">
                      Setup Coverage
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {isNamedWangPreset
                        ? `${namedWangSetCount} sets, ${namedWangColorCount} colors, ${namedWangTileCount} tile assignments configured.`
                        : `${assignedRequiredAssignments} of ${totalRequiredAssignments} required pattern blocks assigned.`}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {isNamedWangPreset
                      ? `${namedWangSetCount} set${namedWangSetCount === 1 ? "" : "s"}`
                      : `${draft.terrains.length} rule${draft.terrains.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width]"
                    style={{
                      width: isNamedWangPreset
                        ? namedWangSetCount === 0
                          ? "0%"
                          : "100%"
                        : totalRequiredAssignments === 0
                          ? "0%"
                          : `${(assignedRequiredAssignments / totalRequiredAssignments) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="flex flex-col gap-4">
                {isNamedWangPreset ? (
                  <AutotileNamedWangEditor
                    wangSets={draft.wangSets ?? []}
                    activeWangSetId={activeWangSetId}
                    tilesetImage={tilesetImage}
                    selectionTarget={selectionTarget}
                    onAddSet={handleAddWangSet}
                    onDeleteSet={handleDeleteWangSet}
                    onSelectSet={handleSelectWangSet}
                    onUpdateSetName={handleUpdateWangSetName}
                    onUpdateSetType={handleUpdateWangSetType}
                    onSelectSetTile={handleSelectWangSetTile}
                    onClearSetTile={handleClearWangSetTile}
                    onAddColor={handleAddWangColor}
                    onDeleteColor={handleDeleteWangColor}
                    onUpdateColorName={handleUpdateWangColorName}
                    onUpdateColorValue={handleUpdateWangColorValue}
                    onUpdateColorProbability={handleUpdateWangColorProbability}
                    onSelectColorTile={handleSelectWangColorTile}
                    onClearColorTile={handleClearWangColorTile}
                    onAddTile={handleAddWangTile}
                    onDeleteTile={handleDeleteWangTile}
                    onSelectTile={handleSelectWangTile}
                    onClearTile={handleClearWangTile}
                    onUpdateTileProbability={handleUpdateWangTileProbability}
                    onUpdateTileWangColor={handleUpdateWangTileColor}
                  />
                ) : (
                  <>
                    {hasLegacyRules && (
                      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                        <h3 className="text-sm font-medium text-foreground">
                          Existing rule setup detected
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          This tileset already has a rule-based autotile setup.
                          Saving here converts it into the new visual builder
                          and rewrites the generated rules stored on the
                          tileset.
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
                          Create a rule on the left, then use the center paint
                          tile and surrounding pattern blocks to configure it.
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
                            <h4 className="text-sm font-medium">
                              Detail Level
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Start simple and only choose the pattern
                              situations you want this tileset to support.
                            </p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            {AUTOTILE_PRESET_DEFINITIONS.map((preset) => {
                              const checked = draft.preset === preset.id;
                              const inputId = `autotile-preset-${preset.id}`;
                              const descriptionId = `${inputId}-description`;

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
                                    aria-describedby={descriptionId}
                                    onChange={() =>
                                      handlePresetChange(preset.id)
                                    }
                                  />
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-medium text-foreground">
                                      {preset.label}
                                    </h5>
                                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                      {preset.id === "wang-named-colors"
                                        ? "Named sets"
                                        : `${preset.requiredSlots.length} required`}
                                    </span>
                                  </div>
                                  <p
                                    id={descriptionId}
                                    className="mt-2 text-xs text-muted-foreground"
                                  >
                                    {preset.description}
                                  </p>
                                </label>
                              );
                            })}
                          </div>

                          {presetDefinition.editorLayout === "grid" ? (
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
                          ) : presetDefinition.editorLayout === "wang" ? (
                            <AutotileWangPatternEditor
                              terrain={activeTerrain}
                              tilesetImage={tilesetImage}
                              patternDefinitions={activePatternDefinitions}
                              requiredSlotIds={presetDefinition.requiredSlots}
                              selectionTarget={selectionTarget}
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
                          ) : (
                            <div className="space-y-4">
                              <section role="region" aria-label="Paint tile">
                                <div className="mb-3 space-y-1">
                                  <h5 className="text-xs font-medium text-foreground">
                                    Paint Tile
                                  </h5>
                                  <p className="text-xs text-muted-foreground">
                                    Choose the base terrain tile, then assign
                                    the 47 blob patterns below.
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/70 p-3">
                                  <button
                                    type="button"
                                    id={`autotile-pattern-group-${activeTerrain.id}-paint`}
                                    name={`autotile-pattern-group-${activeTerrain.id}-paint`}
                                    aria-label={`Assign paint tile for ${activeTerrain.name}`}
                                    aria-pressed={
                                      selectionTarget?.type === "terrain" &&
                                      selectionTarget.terrainId ===
                                        activeTerrain.id
                                    }
                                    className={cn(
                                      "flex min-h-26 w-full max-w-44 flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors",
                                      selectionTarget?.type === "terrain" &&
                                        selectionTarget.terrainId ===
                                          activeTerrain.id
                                        ? "border-foreground bg-secondary"
                                        : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                                    )}
                                    onMouseDown={() =>
                                      handleSelectTarget({
                                        type: "terrain",
                                        terrainId: activeTerrain.id,
                                      })
                                    }
                                  >
                                    <AutotileTilePreview
                                      image={tilesetImage}
                                      region={activeTerrain.paletteTile}
                                      size={60}
                                      emptyLabel="Paint"
                                      className="h-15 w-15"
                                    />
                                    <span className="mt-2 text-[11px] font-medium leading-tight text-foreground">
                                      Paint Tile
                                    </span>
                                  </button>

                                  <div className="min-w-0 flex-1 space-y-1">
                                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                      Assigned Tile
                                    </p>
                                    <p className="text-xs text-foreground">
                                      {activeTerrain.paletteTile
                                        ? `Pixel origin (${activeTerrain.paletteTile.sx}, ${activeTerrain.paletteTile.sy})`
                                        : "No tile assigned yet"}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Blob rules fall back to this tile when no
                                      assigned pattern matches.
                                    </p>
                                  </div>

                                  {activeTerrain.paletteTile && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      onMouseDown={handleClearPaintTile}
                                    >
                                      Clear
                                    </Button>
                                  )}
                                </div>
                              </section>

                              <section
                                role="region"
                                aria-label="Blob pattern tiles"
                              >
                                <div className="mb-3 space-y-1">
                                  <h5 className="text-xs font-medium text-foreground">
                                    Blob Patterns
                                  </h5>
                                  <p className="text-xs text-muted-foreground">
                                    The 47 valid gated 8-neighbor masks are
                                    grouped by shape so you can work through
                                    large tilesets faster.
                                  </p>
                                </div>

                                <Accordion
                                  key={`${draft.preset}-${activeTerrain.id}`}
                                  type="multiple"
                                  defaultValue={defaultOpenPatternCardGroupIds}
                                  className="rounded-xl border border-border bg-background/70 px-3"
                                >
                                  {activePatternCardGroups.map((group) => {
                                    const groupAssignedCount =
                                      countConfiguredAssignments(
                                        activeTerrain,
                                        group.slotIds,
                                      );

                                    return (
                                      <AccordionItem
                                        key={group.id}
                                        value={group.id}
                                      >
                                        <AccordionTrigger className="gap-3 py-4 text-left hover:no-underline">
                                          <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pr-2">
                                            <div className="min-w-0 space-y-1">
                                              <h6 className="text-xs font-medium text-foreground">
                                                {group.title}
                                              </h6>
                                              <p className="text-xs text-muted-foreground">
                                                {group.description}
                                              </p>
                                            </div>

                                            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                              {groupAssignedCount}/
                                              {group.slotIds.length}
                                            </span>
                                          </div>
                                        </AccordionTrigger>

                                        <AccordionContent>
                                          <div className="grid gap-3 xl:grid-cols-2">
                                            {group.slotIds.map((slotId) => {
                                              const definition =
                                                activePatternDefinitionMap.get(
                                                  slotId,
                                                );

                                              if (!definition) {
                                                return null;
                                              }

                                              const tile =
                                                activeTerrain.patternTiles?.[
                                                  definition.id
                                                ] ?? null;
                                              const isSelected =
                                                selectionTarget?.type ===
                                                  "pattern" &&
                                                selectionTarget.terrainId ===
                                                  activeTerrain.id &&
                                                selectionTarget.slotId ===
                                                  definition.id;

                                              return (
                                                <AutotilePatternTileCard
                                                  key={`${activeTerrain.id}-${definition.id}`}
                                                  buttonId={`autotile-pattern-card-${activeTerrain.id}-${definition.id}`}
                                                  definition={definition}
                                                  image={tilesetImage}
                                                  isRequired={presetDefinition.requiredSlots.includes(
                                                    definition.id,
                                                  )}
                                                  isSelected={isSelected}
                                                  onClear={
                                                    tile
                                                      ? () =>
                                                          handleClearPatternSlot(
                                                            definition.id,
                                                          )
                                                      : undefined
                                                  }
                                                  tile={tile}
                                                  onPick={() =>
                                                    handleSelectPatternSlot(
                                                      definition.id,
                                                    )
                                                  }
                                                />
                                              );
                                            })}
                                          </div>
                                        </AccordionContent>
                                      </AccordionItem>
                                    );
                                  })}
                                </Accordion>
                              </section>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </>
                )}
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
