import { useCallback, useMemo, useState } from "react";
import { Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import {
  AUTOTILE_CONFIG_VERSION,
  AUTOTILE_NEIGHBOR_POSITIONS,
  type AutotileConfig,
  type AutotileNeighborMatcher,
  type AutotileNeighborPosition,
  type AutotileRule,
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
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import type {
  AutotileDialogProps,
  AutotileSelectionTarget,
} from "@/features/map-editor/types/dialogs";
import { generateAutotileRuleId, generateAutotileTerrainId } from "@/utils/ids";

const POSITION_LABELS: Record<AutotileNeighborPosition, string> = {
  northWest: "NW",
  north: "N",
  northEast: "NE",
  west: "W",
  east: "E",
  southWest: "SW",
  south: "S",
  southEast: "SE",
};

const MATCHER_FIELD_CLASS_NAME =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-[11px] outline-none transition-colors focus:border-foreground";

function createEmptyAutotileConfig(): AutotileConfig {
  return {
    version: AUTOTILE_CONFIG_VERSION,
    terrains: [],
    rules: [],
  };
}

function cloneAutotileConfig(
  autotile: AutotileConfig | null | undefined,
): AutotileConfig {
  if (!autotile) {
    return createEmptyAutotileConfig();
  }

  return JSON.parse(JSON.stringify(autotile)) as AutotileConfig;
}

function createDefaultNeighbors(): AutotileRule["neighbors"] {
  return {
    northWest: { kind: "any" },
    north: { kind: "any" },
    northEast: { kind: "any" },
    west: { kind: "any" },
    east: { kind: "any" },
    southWest: { kind: "any" },
    south: { kind: "any" },
    southEast: { kind: "any" },
  };
}

function encodeMatcher(matcher: AutotileNeighborMatcher): string {
  switch (matcher.kind) {
    case "any":
    case "empty":
    case "filled":
      return matcher.kind;
    case "terrain":
      return `terrain:${matcher.terrainId}`;
    case "notTerrain":
      return `notTerrain:${matcher.terrainId}`;
  }
}

function decodeMatcher(value: string): AutotileNeighborMatcher {
  if (value === "any" || value === "empty" || value === "filled") {
    return { kind: value };
  }

  const [kind, terrainId] = value.split(":");
  if (kind === "terrain" && terrainId) {
    return {
      kind: "terrain",
      terrainId: terrainId as AutotileNeighborMatcher extends {
        kind: "terrain";
        terrainId: infer T;
      }
        ? T
        : never,
    };
  }
  if (kind === "notTerrain" && terrainId) {
    return {
      kind: "notTerrain",
      terrainId: terrainId as AutotileNeighborMatcher extends {
        kind: "notTerrain";
        terrainId: infer T;
      }
        ? T
        : never,
    };
  }

  return { kind: "any" };
}

function formatTileLabel(
  region: AutotileTileRegion | null,
  tileSize: number,
): string {
  if (!region) {
    return "Unassigned";
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

  if (target.type === "terrain") {
    return (
      autotile.terrains.find((terrain) => terrain.id === target.terrainId)
        ?.paletteTile ?? null
    );
  }

  return (
    autotile.rules.find((rule) => rule.id === target.ruleId)?.output ?? null
  );
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

  const highlightedTile = useMemo(
    () => getTargetTile(draft, selectionTarget) ?? lastCanvasTile,
    [draft, lastCanvasTile, selectionTarget],
  );

  const handleCanvasTileSelect = useCallback(
    (tile: AutotileTileRegion) => {
      setLastCanvasTile(tile);

      if (!selectionTarget) {
        return;
      }

      setDraft((current) => {
        if (selectionTarget.type === "terrain") {
          return {
            ...current,
            terrains: current.terrains.map((terrain) =>
              terrain.id === selectionTarget.terrainId
                ? { ...terrain, paletteTile: tile }
                : terrain,
            ),
          };
        }

        return {
          ...current,
          rules: current.rules.map((rule) =>
            rule.id === selectionTarget.ruleId
              ? { ...rule, output: tile }
              : rule,
          ),
        };
      });
    },
    [selectionTarget],
  );

  const handleAddTerrain = useCallback(() => {
    setDraft((current) => ({
      ...current,
      terrains: [
        ...current.terrains,
        {
          id: generateAutotileTerrainId(),
          name: `Terrain ${current.terrains.length + 1}`,
          paletteTile: null,
        },
      ],
    }));
  }, []);

  const handleRemoveTerrain = useCallback(
    (terrainId: AutotileTerrain["id"]) => {
      setDraft((current) => ({
        ...current,
        terrains: current.terrains.filter(
          (terrain) => terrain.id !== terrainId,
        ),
        rules: current.rules
          .filter((rule) => rule.centerTerrainId !== terrainId)
          .map((rule) => ({
            ...rule,
            neighbors: Object.fromEntries(
              AUTOTILE_NEIGHBOR_POSITIONS.map((position) => {
                const matcher = rule.neighbors[position];
                if (
                  (matcher.kind === "terrain" ||
                    matcher.kind === "notTerrain") &&
                  matcher.terrainId === terrainId
                ) {
                  return [
                    position,
                    { kind: "any" } satisfies AutotileNeighborMatcher,
                  ];
                }

                return [position, matcher];
              }),
            ) as AutotileRule["neighbors"],
          })),
      }));
      setSelectionTarget((current) =>
        current?.type === "terrain" && current.terrainId === terrainId
          ? null
          : current,
      );
    },
    [],
  );

  const handleAddRule = useCallback(() => {
    setDraft((current) => {
      const firstTerrain = current.terrains[0];
      if (!firstTerrain) {
        return current;
      }

      return {
        ...current,
        rules: [
          ...current.rules,
          {
            id: generateAutotileRuleId(),
            name: `Rule ${current.rules.length + 1}`,
            centerTerrainId: firstTerrain.id,
            neighbors: createDefaultNeighbors(),
            output: null,
          },
        ],
      };
    });
  }, []);

  const handleRuleMove = useCallback(
    (ruleId: AutotileRule["id"], direction: -1 | 1) => {
      setDraft((current) => {
        const index = current.rules.findIndex((rule) => rule.id === ruleId);
        const nextIndex = index + direction;
        if (
          index === -1 ||
          nextIndex < 0 ||
          nextIndex >= current.rules.length
        ) {
          return current;
        }

        const nextRules = [...current.rules];
        const [rule] = nextRules.splice(index, 1);
        nextRules.splice(nextIndex, 0, rule);
        return { ...current, rules: nextRules };
      });
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (!enabled) {
      onSave(undefined);
      onOpenChange(false);
      return;
    }

    onSave({
      ...draft,
      version: AUTOTILE_CONFIG_VERSION,
    });
    onOpenChange(false);
  }, [draft, enabled, onOpenChange, onSave]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[92vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Autotile Rules</DialogTitle>
          <DialogDescription>
            Define terrain tags and ordered neighbor rules for this tileset.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border border-border rounded-xl px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="autotile-enabled">
              Enable Autotile For This Tileset
            </Label>
            <p className="text-xs text-muted-foreground">
              Disable this to remove the tileset-specific autotile
              configuration.
            </p>
          </div>
          <Switch
            id="autotile-enabled"
            name="autotile-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Tileset Picker</h3>
                <p className="text-xs text-muted-foreground">
                  {selectionTarget
                    ? "Click a tile to assign it to the current picker target."
                    : "Select a terrain or rule target, then click a tile."}
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
                "Picking a palette tile for the selected terrain."}
              {selectionTarget?.type === "rule" &&
                "Picking an output tile for the selected rule."}
              {!selectionTarget && "No picker target selected."}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
              <section className="rounded-xl border border-border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">Terrain Tags</h3>
                    <p className="text-xs text-muted-foreground">
                      Each terrain gets one palette tile used to seed autotile
                      painting.
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

                <div className="flex flex-col gap-3">
                  {draft.terrains.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      Add at least one terrain tag before creating rules.
                    </div>
                  )}

                  {draft.terrains.map((terrain) => (
                    <div
                      key={terrain.id}
                      className="rounded-lg border border-border bg-muted/20 p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
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
                                    ? { ...candidate, name: event.target.value }
                                    : candidate,
                                ),
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`autotile-terrain-tile-${terrain.id}`}
                          >
                            Palette Tile
                          </Label>
                          <Button
                            type="button"
                            id={`autotile-terrain-tile-${terrain.id}`}
                            name={`autotile-terrain-tile-${terrain.id}`}
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
                            Pick Tile
                          </Button>
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

                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatTileLabel(terrain.paletteTile, tileset.tileSize)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">Ordered Rules</h3>
                    <p className="text-xs text-muted-foreground">
                      The first matching rule wins for a terrain cell.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={draft.terrains.length === 0}
                    onMouseDown={handleAddRule}
                  >
                    <Plus />
                    Add Rule
                  </Button>
                </div>

                <div className="flex flex-col gap-3">
                  {draft.rules.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      No rules yet. Add a rule to map neighbor patterns to
                      tiles.
                    </div>
                  )}

                  {draft.rules.map((rule, index) => (
                    <div
                      key={rule.id}
                      className="rounded-lg border border-border bg-muted/20 p-3"
                    >
                      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto_auto_auto] sm:items-end">
                        <div className="space-y-1">
                          <Label htmlFor={`autotile-rule-name-${rule.id}`}>
                            Rule Name
                          </Label>
                          <Input
                            id={`autotile-rule-name-${rule.id}`}
                            name={`autotile-rule-name-${rule.id}`}
                            className="h-8 text-xs"
                            value={rule.name}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                rules: current.rules.map((candidate) =>
                                  candidate.id === rule.id
                                    ? { ...candidate, name: event.target.value }
                                    : candidate,
                                ),
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`autotile-rule-center-${rule.id}`}>
                            Center Terrain
                          </Label>
                          <select
                            id={`autotile-rule-center-${rule.id}`}
                            name={`autotile-rule-center-${rule.id}`}
                            className={MATCHER_FIELD_CLASS_NAME}
                            value={rule.centerTerrainId}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                rules: current.rules.map((candidate) =>
                                  candidate.id === rule.id
                                    ? {
                                        ...candidate,
                                        centerTerrainId: event.target
                                          .value as AutotileRule["centerTerrainId"],
                                      }
                                    : candidate,
                                ),
                              }))
                            }
                          >
                            {draft.terrains.map((terrain) => (
                              <option key={terrain.id} value={terrain.id}>
                                {terrain.name || "Unnamed terrain"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`autotile-rule-output-${rule.id}`}>
                            Output Tile
                          </Label>
                          <Button
                            type="button"
                            id={`autotile-rule-output-${rule.id}`}
                            name={`autotile-rule-output-${rule.id}`}
                            variant={
                              selectionTarget?.type === "rule" &&
                              selectionTarget.ruleId === rule.id
                                ? "default"
                                : "outline"
                            }
                            size="xs"
                            onMouseDown={() =>
                              setSelectionTarget({
                                type: "rule",
                                ruleId: rule.id,
                              })
                            }
                          >
                            Pick Tile
                          </Button>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={index === 0}
                          onMouseDown={() => handleRuleMove(rule.id, -1)}
                        >
                          Up
                        </Button>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={index === draft.rules.length - 1}
                            onMouseDown={() => handleRuleMove(rule.id, 1)}
                          >
                            Down
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive"
                            aria-label={`Remove rule ${rule.name}`}
                            onMouseDown={() =>
                              setDraft((current) => ({
                                ...current,
                                rules: current.rules.filter(
                                  (candidate) => candidate.id !== rule.id,
                                ),
                              }))
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>

                      <p className="mb-3 text-xs text-muted-foreground">
                        {formatTileLabel(rule.output, tileset.tileSize)}
                      </p>

                      <div className="grid grid-cols-3 gap-2">
                        {AUTOTILE_NEIGHBOR_POSITIONS.slice(0, 3).map(
                          (position) => (
                            <div key={position} className="space-y-1">
                              <Label
                                htmlFor={`autotile-rule-${rule.id}-${position}`}
                                className="text-[11px]"
                              >
                                {POSITION_LABELS[position]}
                              </Label>
                              <select
                                id={`autotile-rule-${rule.id}-${position}`}
                                name={`autotile-rule-${rule.id}-${position}`}
                                className={MATCHER_FIELD_CLASS_NAME}
                                value={encodeMatcher(rule.neighbors[position])}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    rules: current.rules.map((candidate) =>
                                      candidate.id === rule.id
                                        ? {
                                            ...candidate,
                                            neighbors: {
                                              ...candidate.neighbors,
                                              [position]: decodeMatcher(
                                                event.target.value,
                                              ),
                                            },
                                          }
                                        : candidate,
                                    ),
                                  }))
                                }
                              >
                                <option value="any">Any</option>
                                <option value="empty">Empty</option>
                                <option value="filled">Filled</option>
                                {draft.terrains.map((terrain) => (
                                  <option
                                    key={`terrain-${position}-${terrain.id}`}
                                    value={`terrain:${terrain.id}`}
                                  >
                                    {terrain.name || "Unnamed"}
                                  </option>
                                ))}
                                {draft.terrains.map((terrain) => (
                                  <option
                                    key={`not-terrain-${position}-${terrain.id}`}
                                    value={`notTerrain:${terrain.id}`}
                                  >
                                    Not {terrain.name || "Unnamed"}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ),
                        )}

                        <div className="space-y-1">
                          <Label
                            htmlFor={`autotile-rule-${rule.id}-west`}
                            className="text-[11px]"
                          >
                            W
                          </Label>
                          <select
                            id={`autotile-rule-${rule.id}-west`}
                            name={`autotile-rule-${rule.id}-west`}
                            className={MATCHER_FIELD_CLASS_NAME}
                            value={encodeMatcher(rule.neighbors.west)}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                rules: current.rules.map((candidate) =>
                                  candidate.id === rule.id
                                    ? {
                                        ...candidate,
                                        neighbors: {
                                          ...candidate.neighbors,
                                          west: decodeMatcher(
                                            event.target.value,
                                          ),
                                        },
                                      }
                                    : candidate,
                                ),
                              }))
                            }
                          >
                            <option value="any">Any</option>
                            <option value="empty">Empty</option>
                            <option value="filled">Filled</option>
                            {draft.terrains.map((terrain) => (
                              <option
                                key={`terrain-west-${terrain.id}`}
                                value={`terrain:${terrain.id}`}
                              >
                                {terrain.name || "Unnamed"}
                              </option>
                            ))}
                            {draft.terrains.map((terrain) => (
                              <option
                                key={`not-terrain-west-${terrain.id}`}
                                value={`notTerrain:${terrain.id}`}
                              >
                                Not {terrain.name || "Unnamed"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-background/60 px-2 text-[11px] text-muted-foreground">
                          {draft.terrains.find(
                            (terrain) => terrain.id === rule.centerTerrainId,
                          )?.name ?? "Center"}
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`autotile-rule-${rule.id}-east`}
                            className="text-[11px]"
                          >
                            E
                          </Label>
                          <select
                            id={`autotile-rule-${rule.id}-east`}
                            name={`autotile-rule-${rule.id}-east`}
                            className={MATCHER_FIELD_CLASS_NAME}
                            value={encodeMatcher(rule.neighbors.east)}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                rules: current.rules.map((candidate) =>
                                  candidate.id === rule.id
                                    ? {
                                        ...candidate,
                                        neighbors: {
                                          ...candidate.neighbors,
                                          east: decodeMatcher(
                                            event.target.value,
                                          ),
                                        },
                                      }
                                    : candidate,
                                ),
                              }))
                            }
                          >
                            <option value="any">Any</option>
                            <option value="empty">Empty</option>
                            <option value="filled">Filled</option>
                            {draft.terrains.map((terrain) => (
                              <option
                                key={`terrain-east-${terrain.id}`}
                                value={`terrain:${terrain.id}`}
                              >
                                {terrain.name || "Unnamed"}
                              </option>
                            ))}
                            {draft.terrains.map((terrain) => (
                              <option
                                key={`not-terrain-east-${terrain.id}`}
                                value={`notTerrain:${terrain.id}`}
                              >
                                Not {terrain.name || "Unnamed"}
                              </option>
                            ))}
                          </select>
                        </div>

                        {AUTOTILE_NEIGHBOR_POSITIONS.slice(5).map(
                          (position) => (
                            <div key={position} className="space-y-1">
                              <Label
                                htmlFor={`autotile-rule-${rule.id}-${position}`}
                                className="text-[11px]"
                              >
                                {POSITION_LABELS[position]}
                              </Label>
                              <select
                                id={`autotile-rule-${rule.id}-${position}`}
                                name={`autotile-rule-${rule.id}-${position}`}
                                className={MATCHER_FIELD_CLASS_NAME}
                                value={encodeMatcher(rule.neighbors[position])}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    rules: current.rules.map((candidate) =>
                                      candidate.id === rule.id
                                        ? {
                                            ...candidate,
                                            neighbors: {
                                              ...candidate.neighbors,
                                              [position]: decodeMatcher(
                                                event.target.value,
                                              ),
                                            },
                                          }
                                        : candidate,
                                    ),
                                  }))
                                }
                              >
                                <option value="any">Any</option>
                                <option value="empty">Empty</option>
                                <option value="filled">Filled</option>
                                {draft.terrains.map((terrain) => (
                                  <option
                                    key={`terrain-${position}-${terrain.id}`}
                                    value={`terrain:${terrain.id}`}
                                  >
                                    {terrain.name || "Unnamed"}
                                  </option>
                                ))}
                                {draft.terrains.map((terrain) => (
                                  <option
                                    key={`not-terrain-${position}-${terrain.id}`}
                                    value={`notTerrain:${terrain.id}`}
                                  >
                                    Not {terrain.name || "Unnamed"}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
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
            Save Autotile Rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
