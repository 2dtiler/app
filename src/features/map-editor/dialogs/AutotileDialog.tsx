import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
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
import { AutotileBlobPatternEditor } from "@/features/map-editor/components/autotile/AutotileBlobPatternEditor";
import { AutotileBlobsmithImportButton } from "@/features/map-editor/components/autotile/AutotileBlobsmithImportButton";
import { AutotileDualGridSetupPanel } from "@/features/map-editor/components/autotile/AutotileDualGridSetupPanel";
import { AutotilePatternGroupCard } from "@/features/map-editor/components/autotile/AutotilePatternGroupCard";
import { AutotileTerrainSidebar } from "@/features/map-editor/components/autotile/AutotileTerrainSidebar";
import { AutotileNamedWangEditor } from "@/features/map-editor/components/autotile/AutotileNamedWangEditor";
import { AutotileWangPatternEditor } from "@/features/map-editor/components/autotile/AutotileWangPatternEditor";
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import { useAssetImage } from "@/features/map-editor/hooks/use-asset-image";
import {
  applyTileMapDual4x4Layout,
  applyTileMapDual4x4LayoutToTerrains,
  assignTileToSelectionTarget,
  canApplyTileMapDual4x4Layout,
  cloneAutotileConfig,
  countConfiguredAssignments,
  createDefaultWangSet,
  DEFAULT_AUTOTILE_PRESET_ID,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
  getSelectionInstructions,
  getTargetTile,
  hasPatternAssignments,
  isTileMapDual4x4LayoutApplied,
  TILEMAP_DUAL_4X4_TOO_SMALL_MESSAGE,
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
  const [lastNonNamedWangPreset, setLastNonNamedWangPreset] =
    useState<AutotilePresetId>(() => {
      const preset =
        cloneAutotileConfig(tileset.autotile).preset ??
        DEFAULT_AUTOTILE_PRESET_ID;

      return preset === "wang-named-colors"
        ? DEFAULT_AUTOTILE_PRESET_ID
        : preset;
    });
  const [zoom, setZoom] = useState(1);
  const [selectionTarget, setSelectionTarget] =
    useState<AutotileSelectionTarget | null>(null);
  const tilesetImage = useAssetImage(tileset.assetId);

  const presetDefinition = useMemo(
    () => getAutotilePresetDefinition(draft.preset),
    [draft.preset],
  );

  const isNamedWangPreset = presetDefinition.editorLayout === "wang-named";
  const isDualGridPreset = draft.preset === "dual-grid-15";
  const dualGridAtlasTooSmallWarnedRef = useRef(false);

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
    fallbackPreset: lastNonNamedWangPreset,
    setDraft,
    onSelectTarget: handleSelectTarget,
    onClearSelectionTarget: () => setSelectionTarget(null),
  });

  const handleCanvasTileSelect = useCallback(
    (tile: AutotileTileRegion) => {
      if (!selectionTarget || draft.preset === "dual-grid-15") {
        return;
      }

      setDraft((current) => ({
        ...assignTileToSelectionTarget(current, selectionTarget, tile),
      }));
    },
    [draft.preset, selectionTarget],
  );

  const handleAddTerrain = useCallback(() => {
    const terrainId = generateAutotileTerrainId();

    setDraft((current) => {
      let terrain: AutotileTerrain = {
        id: terrainId,
        name: `Terrain ${current.terrains.length + 1}`,
        paletteTile: null,
        patternTiles: {},
      };

      if (
        current.preset === "dual-grid-15" &&
        tilesetImage &&
        canApplyTileMapDual4x4Layout(
          tilesetImage.naturalWidth || tilesetImage.width,
          tilesetImage.naturalHeight || tilesetImage.height,
          tileset.tileSize,
        )
      ) {
        terrain = applyTileMapDual4x4Layout(terrain, tileset.tileSize);
      }

      return {
        ...current,
        terrains: [...current.terrains, terrain],
      };
    });
    setActiveTerrainId(terrainId);
    setSelectionTarget(
      draft.preset === "dual-grid-15"
        ? null
        : { type: "terrain", terrainId },
    );
  }, [draft.preset, tileset.tileSize, tilesetImage]);

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
    (preset: AutotilePresetId) => {
      if (preset !== "wang-named-colors") {
        setLastNonNamedWangPreset(preset);
      }

      const defaultWangSet =
        preset === "wang-named-colors" && !draft.wangSets?.length
          ? createDefaultWangSet(1)
          : null;

      if (preset === "dual-grid-15") {
        dualGridAtlasTooSmallWarnedRef.current = false;
      }

      setDraft((current) => {
        let terrains = current.terrains;

        if (preset === "dual-grid-15") {
          if (
            tilesetImage &&
            canApplyTileMapDual4x4Layout(
              tilesetImage.naturalWidth || tilesetImage.width,
              tilesetImage.naturalHeight || tilesetImage.height,
              tileset.tileSize,
            )
          ) {
            terrains = applyTileMapDual4x4LayoutToTerrains(
              current.terrains,
              tileset.tileSize,
            );
          } else if (tilesetImage) {
            toast.error(TILEMAP_DUAL_4X4_TOO_SMALL_MESSAGE);
            dualGridAtlasTooSmallWarnedRef.current = true;
          }
        }

        return {
          ...current,
          preset,
          terrains,
          wangSets:
            preset === "wang-named-colors"
              ? defaultWangSet
                ? [defaultWangSet]
                : current.wangSets
              : undefined,
        };
      });
      if (defaultWangSet) {
        setActiveWangSetId(defaultWangSet.id);
      }
      setSelectionTarget(null);
    },
    [draft.wangSets?.length, setActiveWangSetId, tileset.tileSize, tilesetImage],
  );

  useEffect(() => {
    if (draft.preset !== "dual-grid-15" || draft.terrains.length === 0) {
      return;
    }

    if (!tilesetImage) {
      return;
    }

    const imageWidth = tilesetImage.naturalWidth || tilesetImage.width;
    const imageHeight = tilesetImage.naturalHeight || tilesetImage.height;

    if (!canApplyTileMapDual4x4Layout(imageWidth, imageHeight, tileset.tileSize)) {
      if (!dualGridAtlasTooSmallWarnedRef.current) {
        dualGridAtlasTooSmallWarnedRef.current = true;
        toast.error(TILEMAP_DUAL_4X4_TOO_SMALL_MESSAGE);
      }
      return;
    }

    if (
      draft.terrains.every((terrain) =>
        isTileMapDual4x4LayoutApplied(terrain, tileset.tileSize),
      )
    ) {
      return;
    }

    setDraft((current) => {
      if (current.preset !== "dual-grid-15") {
        return current;
      }

      return {
        ...current,
        terrains: applyTileMapDual4x4LayoutToTerrains(
          current.terrains,
          tileset.tileSize,
        ),
      };
    });
  }, [draft.preset, draft.terrains, tileset.tileSize, tilesetImage]);

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

  const handleBlobsmithImportApply = useCallback(
    (appliedTerrain: AutotileTerrain) => {
      setDraft((current) => ({
        ...current,
        terrains: current.terrains.map((candidate) =>
          candidate.id === appliedTerrain.id ? appliedTerrain : candidate,
        ),
      }));
    },
    [],
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
              : isDualGridPreset
                ? "Dual Grid binds a 4×4 Godot TileMapDual atlas automatically. Create a terrain, then save."
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

                          <AutotileBlobsmithImportButton
                            enabled={draft.preset === "blob-47"}
                            slotIds={presetDefinition.requiredSlots}
                            tileSize={tileset.tileSize}
                            terrain={activeTerrain}
                            onApply={handleBlobsmithImportApply}
                          />

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
                          ) : isDualGridPreset ? (
                            <AutotileDualGridSetupPanel
                              terrain={activeTerrain}
                              tilesetImage={tilesetImage}
                            />
                          ) : (
                            <AutotileBlobPatternEditor
                              terrain={activeTerrain}
                              tilesetImage={tilesetImage}
                              cardGroups={activePatternCardGroups}
                              definitionMap={activePatternDefinitionMap}
                              requiredSlotIds={presetDefinition.requiredSlots}
                              selectionTarget={selectionTarget}
                              defaultOpenGroupIds={
                                defaultOpenPatternCardGroupIds
                              }
                              onSelectPaintTile={() =>
                                handleSelectTarget({
                                  type: "terrain",
                                  terrainId: activeTerrain.id,
                                })
                              }
                              onClearPaintTile={handleClearPaintTile}
                              onSelectSlot={handleSelectPatternSlot}
                              onClearSlot={handleClearPatternSlot}
                            />
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
