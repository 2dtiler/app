import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import type {
  AutotileNamedWangColorListProps,
  AutotileNamedWangEditorProps,
  AutotileNamedWangSetDetailsProps,
  AutotileNamedWangTileAssignmentsProps,
} from "@/features/map-editor/types/autotile-dialog";
import {
  AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE,
  AUTOTILE_WANG_POSITION_INDEXES,
  type AutotileWangColor,
  type AutotileWangPosition,
  type AutotileWangSetType,
} from "@/types";
import { cn } from "@/utils/cn";

const WANG_SET_TYPE_OPTIONS = [
  {
    value: "edge",
    label: "Edge",
    description: "North, east, south, and west colors.",
  },
  {
    value: "corner",
    label: "Corner",
    description: "Diagonal corner colors only.",
  },
  {
    value: "mixed",
    label: "Mixed",
    description: "Edges and corners in one Wang set.",
  },
] as const;

const WANG_POSITION_LABELS = {
  north: "Top",
  northEast: "Top Right",
  east: "Right",
  southEast: "Bottom Right",
  south: "Bottom",
  southWest: "Bottom Left",
  west: "Left",
  northWest: "Top Left",
} as const satisfies Record<AutotileWangPosition, string>;

function getNextColorIndex(colors: readonly AutotileWangColor[]) {
  return (
    colors.reduce((maximum, color) => Math.max(maximum, color.index), 0) + 1
  );
}

function formatProbability(probability: number) {
  return Number.isFinite(probability) ? String(probability) : "1";
}

export function AutotileNamedWangEditor({
  wangSets,
  activeWangSetId,
  tilesetImage,
  selectionTarget,
  onAddSet,
  onDeleteSet,
  onSelectSet,
  onUpdateSetName,
  onUpdateSetType,
  onSelectSetTile,
  onClearSetTile,
  onAddColor,
  onDeleteColor,
  onUpdateColorName,
  onUpdateColorValue,
  onUpdateColorProbability,
  onSelectColorTile,
  onClearColorTile,
  onAddTile,
  onDeleteTile,
  onSelectTile,
  onClearTile,
  onUpdateTileProbability,
  onUpdateTileWangColor,
}: AutotileNamedWangEditorProps) {
  const activeWangSet =
    wangSets.find((wangSet) => wangSet.id === activeWangSetId) ?? null;

  return (
    <section
      role="region"
      aria-label="Wang named colors editor"
      className="rounded-xl border border-border p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium text-foreground">
            Wang Named Colors
          </h3>
          <p className="text-xs text-muted-foreground">
            Create Tiled-compatible Wang sets, name their colors, assign palette
            tiles, then map actual tiles to edge and corner color combinations.
          </p>
        </div>
        <Button
          type="button"
          id="autotile-wang-add-set"
          name="autotile-wang-add-set"
          variant="outline"
          size="xs"
          onMouseDown={onAddSet}
        >
          <Plus />
          Add Set
        </Button>
      </div>

      {wangSets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">
          Add a Wang set to start defining named colors and tile assignments.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[13rem_minmax(0,1fr)]">
          <div
            role="list"
            aria-label="Wang sets"
            className="space-y-2 rounded-xl border border-border bg-background/70 p-2"
          >
            {wangSets.map((wangSet, index) => {
              const isActive = wangSet.id === activeWangSetId;

              return (
                <div
                  key={wangSet.id}
                  role="listitem"
                  className={cn(
                    "flex items-stretch gap-2 rounded-lg border p-2 transition-colors",
                    isActive
                      ? "border-foreground bg-secondary"
                      : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                  )}
                >
                  <button
                    type="button"
                    id={`autotile-wang-set-${wangSet.id}`}
                    name={`autotile-wang-set-${wangSet.id}`}
                    aria-pressed={isActive}
                    className="min-w-0 flex-1 text-left"
                    onMouseDown={() => onSelectSet(wangSet.id)}
                  >
                    <span className="block truncate text-xs font-medium text-foreground">
                      {wangSet.name || `Wang Set ${index + 1}`}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {wangSet.colors.length} colors, {wangSet.tiles.length}{" "}
                      tiles
                    </span>
                  </button>
                  <Button
                    type="button"
                    id={`autotile-wang-set-${wangSet.id}-delete`}
                    name={`autotile-wang-set-${wangSet.id}-delete`}
                    variant="ghost"
                    size="icon-xs"
                    className="self-start text-destructive"
                    aria-label={`Delete ${wangSet.name || `Wang Set ${index + 1}`}`}
                    onMouseDown={() => onDeleteSet(wangSet.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>

          {!activeWangSet ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">
              Select a Wang set to edit its colors and tile assignments.
            </div>
          ) : (
            <div className="space-y-4">
              <WangSetDetails
                wangSet={activeWangSet}
                tilesetImage={tilesetImage}
                selectionTarget={selectionTarget}
                onUpdateSetName={onUpdateSetName}
                onUpdateSetType={onUpdateSetType}
                onSelectSetTile={onSelectSetTile}
                onClearSetTile={onClearSetTile}
              />

              <WangColorList
                wangSet={activeWangSet}
                tilesetImage={tilesetImage}
                selectionTarget={selectionTarget}
                onAddColor={onAddColor}
                onDeleteColor={onDeleteColor}
                onUpdateColorName={onUpdateColorName}
                onUpdateColorValue={onUpdateColorValue}
                onUpdateColorProbability={onUpdateColorProbability}
                onSelectColorTile={onSelectColorTile}
                onClearColorTile={onClearColorTile}
              />

              <WangTileAssignments
                wangSet={activeWangSet}
                tilesetImage={tilesetImage}
                selectionTarget={selectionTarget}
                onAddTile={onAddTile}
                onDeleteTile={onDeleteTile}
                onSelectTile={onSelectTile}
                onClearTile={onClearTile}
                onUpdateTileProbability={onUpdateTileProbability}
                onUpdateTileWangColor={onUpdateTileWangColor}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function WangSetDetails({
  wangSet,
  tilesetImage,
  selectionTarget,
  onUpdateSetName,
  onUpdateSetType,
  onSelectSetTile,
  onClearSetTile,
}: AutotileNamedWangSetDetailsProps) {
  const isSetTileSelected =
    selectionTarget?.type === "wangSetTile" &&
    selectionTarget.wangSetId === wangSet.id;

  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-1">
          <Label htmlFor={`autotile-wang-set-name-${wangSet.id}`}>
            Set Name
          </Label>
          <Input
            id={`autotile-wang-set-name-${wangSet.id}`}
            name={`autotile-wang-set-name-${wangSet.id}`}
            className="h-8 text-xs"
            value={wangSet.name}
            onChange={(event) =>
              onUpdateSetName(wangSet.id, event.target.value)
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`autotile-wang-set-type-${wangSet.id}`}>
            Set Type
          </Label>
          <select
            id={`autotile-wang-set-type-${wangSet.id}`}
            name={`autotile-wang-set-type-${wangSet.id}`}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={wangSet.type}
            onChange={(event) =>
              onUpdateSetType(
                wangSet.id,
                event.target.value as AutotileWangSetType,
              )
            }
          >
            {WANG_SET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
        <div className="relative">
          {wangSet.tile && (
            <Button
              type="button"
              id={`autotile-wang-set-tile-${wangSet.id}-clear`}
              name={`autotile-wang-set-tile-${wangSet.id}-clear`}
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-background"
              aria-label={`Clear representative tile for ${wangSet.name}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClearSetTile(wangSet.id);
              }}
            >
              <X />
            </Button>
          )}
          <button
            type="button"
            id={`autotile-wang-set-tile-${wangSet.id}`}
            name={`autotile-wang-set-tile-${wangSet.id}`}
            aria-label={`Assign representative tile for ${wangSet.name}`}
            aria-pressed={isSetTileSelected}
            className={cn(
              "flex min-h-28 w-full flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors",
              isSetTileSelected
                ? "border-foreground bg-secondary"
                : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
            )}
            onMouseDown={() => onSelectSetTile(wangSet.id)}
          >
            <AutotileTilePreview
              image={tilesetImage}
              region={wangSet.tile}
              size={56}
              emptyLabel="Set"
              ariaLabel={`Representative tile preview for ${wangSet.name}`}
              className="h-14 w-14"
            />
            <span className="mt-2 text-[10px] font-medium leading-tight text-foreground">
              Set Tile
            </span>
          </button>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            {WANG_SET_TYPE_OPTIONS.find(
              (option) => option.value === wangSet.type,
            )?.description ?? "Named Wang colors for Tiled export."}
          </p>
          <p>
            Use the set tile as the representative tile Tiled shows for this
            Wang set. Individual color tiles and Wang tile assignments are
            configured below.
          </p>
        </div>
      </div>
    </div>
  );
}

function WangColorList({
  wangSet,
  tilesetImage,
  selectionTarget,
  onAddColor,
  onDeleteColor,
  onUpdateColorName,
  onUpdateColorValue,
  onUpdateColorProbability,
  onSelectColorTile,
  onClearColorTile,
}: AutotileNamedWangColorListProps) {
  return (
    <section
      role="region"
      aria-label={`${wangSet.name} Wang colors`}
      className="rounded-xl border border-border bg-background/70 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-foreground">Named Colors</h4>
          <p className="text-xs text-muted-foreground">
            These become Tiled wangcolor entries and are referenced by the tile
            assignments below.
          </p>
        </div>
        <Button
          type="button"
          id={`autotile-wang-color-${wangSet.id}-add`}
          name={`autotile-wang-color-${wangSet.id}-add`}
          variant="outline"
          size="xs"
          onMouseDown={() => onAddColor(wangSet.id)}
        >
          <Plus />
          Add Color {getNextColorIndex(wangSet.colors)}
        </Button>
      </div>

      <div className="space-y-2">
        {wangSet.colors.map((color) => {
          const colorTileSelected =
            selectionTarget?.type === "wangColorTile" &&
            selectionTarget.wangSetId === wangSet.id &&
            selectionTarget.colorIndex === color.index;

          return (
            <div
              key={color.index}
              className="grid gap-2 rounded-lg border border-border p-2 lg:grid-cols-[2.75rem_minmax(8rem,1fr)_5rem_7rem_2rem]"
            >
              <div className="space-y-1">
                <Label
                  htmlFor={`autotile-wang-color-value-${wangSet.id}-${color.index}`}
                >
                  Color
                </Label>
                <input
                  id={`autotile-wang-color-value-${wangSet.id}-${color.index}`}
                  name={`autotile-wang-color-value-${wangSet.id}-${color.index}`}
                  type="color"
                  value={color.color}
                  aria-label={`Display color for ${color.name}`}
                  className="h-8 w-10 rounded-md border border-border bg-background p-1"
                  onChange={(event) =>
                    onUpdateColorValue(
                      wangSet.id,
                      color.index,
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`autotile-wang-color-name-${wangSet.id}-${color.index}`}
                >
                  Name
                </Label>
                <Input
                  id={`autotile-wang-color-name-${wangSet.id}-${color.index}`}
                  name={`autotile-wang-color-name-${wangSet.id}-${color.index}`}
                  className="h-8 text-xs"
                  value={color.name}
                  onChange={(event) =>
                    onUpdateColorName(
                      wangSet.id,
                      color.index,
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`autotile-wang-color-probability-${wangSet.id}-${color.index}`}
                >
                  Weight
                </Label>
                <Input
                  id={`autotile-wang-color-probability-${wangSet.id}-${color.index}`}
                  name={`autotile-wang-color-probability-${wangSet.id}-${color.index}`}
                  type="number"
                  min="0"
                  step="0.1"
                  className="h-8 text-xs"
                  value={formatProbability(color.probability)}
                  onChange={(event) =>
                    onUpdateColorProbability(
                      wangSet.id,
                      color.index,
                      Number(event.target.value),
                    )
                  }
                />
              </div>

              <div className="relative space-y-1">
                <Label>Palette Tile</Label>
                {color.tile && (
                  <Button
                    type="button"
                    id={`autotile-wang-color-tile-${wangSet.id}-${color.index}-clear`}
                    name={`autotile-wang-color-tile-${wangSet.id}-${color.index}-clear`}
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1 top-7 z-10 h-5 w-5 rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-background"
                    aria-label={`Clear palette tile for ${color.name}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onClearColorTile(wangSet.id, color.index);
                    }}
                  >
                    <X />
                  </Button>
                )}
                <button
                  type="button"
                  id={`autotile-wang-color-tile-${wangSet.id}-${color.index}`}
                  name={`autotile-wang-color-tile-${wangSet.id}-${color.index}`}
                  aria-label={`Assign palette tile for ${color.name}`}
                  aria-pressed={colorTileSelected}
                  className={cn(
                    "flex h-16 w-full items-center justify-center rounded-md border transition-colors",
                    colorTileSelected
                      ? "border-foreground bg-secondary"
                      : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                  )}
                  onMouseDown={() => onSelectColorTile(wangSet.id, color.index)}
                >
                  <AutotileTilePreview
                    image={tilesetImage}
                    region={color.tile}
                    size={40}
                    emptyLabel={`#${color.index}`}
                    ariaLabel={`Palette tile preview for ${color.name}`}
                    className="h-10 w-10"
                  />
                </button>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  id={`autotile-wang-color-${wangSet.id}-${color.index}-delete`}
                  name={`autotile-wang-color-${wangSet.id}-${color.index}-delete`}
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive"
                  aria-label={`Delete ${color.name}`}
                  onMouseDown={() => onDeleteColor(wangSet.id, color.index)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WangTileAssignments({
  wangSet,
  tilesetImage,
  selectionTarget,
  onAddTile,
  onDeleteTile,
  onSelectTile,
  onClearTile,
  onUpdateTileProbability,
  onUpdateTileWangColor,
}: AutotileNamedWangTileAssignmentsProps) {
  const activePositions = AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE[wangSet.type];

  return (
    <section
      role="region"
      aria-label={`${wangSet.name} Wang tile assignments`}
      className="rounded-xl border border-border bg-background/70 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-foreground">
            Wang Tile Assignments
          </h4>
          <p className="text-xs text-muted-foreground">
            Each assignment pairs a tileset tile with the color indexes on its
            active Wang positions.
          </p>
        </div>
        <Button
          type="button"
          id={`autotile-wang-tile-${wangSet.id}-add`}
          name={`autotile-wang-tile-${wangSet.id}-add`}
          variant="outline"
          size="xs"
          onMouseDown={() => onAddTile(wangSet.id)}
        >
          <Plus />
          Add Tile
        </Button>
      </div>

      {wangSet.tiles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-5 text-xs text-muted-foreground">
          Add a tile assignment, choose its output tile from the picker, then
          set which named colors appear on its Wang positions.
        </div>
      ) : (
        <div className="space-y-3">
          {wangSet.tiles.map((wangTile, tileIndex) => {
            const tileSelected =
              selectionTarget?.type === "wangTile" &&
              selectionTarget.wangSetId === wangSet.id &&
              selectionTarget.tileIndex === tileIndex;
            const tileLabel = `Tile ${tileIndex + 1}`;

            return (
              <div
                key={`${wangSet.id}-${tileIndex}`}
                className="rounded-lg border border-border p-3"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-medium text-foreground">
                      {tileLabel}
                    </h5>
                    <p className="text-[11px] text-muted-foreground">
                      {activePositions.length} active positions for{" "}
                      {wangSet.type}
                    </p>
                  </div>
                  <Button
                    type="button"
                    id={`autotile-wang-tile-${wangSet.id}-${tileIndex}-delete`}
                    name={`autotile-wang-tile-${wangSet.id}-${tileIndex}-delete`}
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive"
                    aria-label={`Delete ${tileLabel}`}
                    onMouseDown={() => onDeleteTile(wangSet.id, tileIndex)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="grid gap-3 lg:grid-cols-[7rem_minmax(0,1fr)]">
                  <div className="relative space-y-1">
                    <Label>Output Tile</Label>
                    {wangTile.tile && (
                      <Button
                        type="button"
                        id={`autotile-wang-tile-${wangSet.id}-${tileIndex}-clear`}
                        name={`autotile-wang-tile-${wangSet.id}-${tileIndex}-clear`}
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1 top-7 z-10 h-5 w-5 rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-background"
                        aria-label={`Clear ${tileLabel}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onClearTile(wangSet.id, tileIndex);
                        }}
                      >
                        <X />
                      </Button>
                    )}
                    <button
                      type="button"
                      id={`autotile-wang-tile-${wangSet.id}-${tileIndex}`}
                      name={`autotile-wang-tile-${wangSet.id}-${tileIndex}`}
                      aria-label={`Assign output tile for ${tileLabel}`}
                      aria-pressed={tileSelected}
                      className={cn(
                        "flex h-24 w-full items-center justify-center rounded-lg border transition-colors",
                        tileSelected
                          ? "border-foreground bg-secondary"
                          : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                      )}
                      onMouseDown={() => onSelectTile(wangSet.id, tileIndex)}
                    >
                      <AutotileTilePreview
                        image={tilesetImage}
                        region={wangTile.tile}
                        size={48}
                        emptyLabel="Tile"
                        ariaLabel={`${tileLabel} preview`}
                        className="h-12 w-12"
                      />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="max-w-28 space-y-1">
                      <Label
                        htmlFor={`autotile-wang-tile-probability-${wangSet.id}-${tileIndex}`}
                      >
                        Variation Weight
                      </Label>
                      <Input
                        id={`autotile-wang-tile-probability-${wangSet.id}-${tileIndex}`}
                        name={`autotile-wang-tile-probability-${wangSet.id}-${tileIndex}`}
                        type="number"
                        min="0"
                        step="0.1"
                        className="h-8 text-xs"
                        value={formatProbability(wangTile.probability)}
                        onChange={(event) =>
                          onUpdateTileProbability(
                            wangSet.id,
                            tileIndex,
                            Number(event.target.value),
                          )
                        }
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {activePositions.map((position) => {
                        const positionIndex =
                          AUTOTILE_WANG_POSITION_INDEXES[position];
                        const selectId = `autotile-wang-tile-${wangSet.id}-${tileIndex}-${position}`;

                        return (
                          <div key={position} className="space-y-1">
                            <Label htmlFor={selectId}>
                              {WANG_POSITION_LABELS[position]}
                            </Label>
                            <select
                              id={selectId}
                              name={selectId}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                              value={wangTile.wangId[positionIndex] ?? 0}
                              onChange={(event) =>
                                onUpdateTileWangColor(
                                  wangSet.id,
                                  tileIndex,
                                  position,
                                  Number(event.target.value),
                                )
                              }
                            >
                              <option value={0}>Unset</option>
                              {wangSet.colors.map((color) => (
                                <option key={color.index} value={color.index}>
                                  {color.index}: {color.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
