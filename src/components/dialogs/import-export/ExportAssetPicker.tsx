import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { drawTileWithOrientation } from "@/components/editor/MapCanvas/texture-cache";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { getAssetUrl } from "@/lib/db";
import { getMapCellBounds, getMapPixelSize } from "@/lib/map-geometry";
import { cn } from "@/lib/utils";
import type {
  ImportExportAssetCardProps,
  ImportExportAssetPickerProps,
  ImportExportFlatSelectableAsset,
  ImportExportMapThumbnailProps,
  ImportExportTilesetThumbnailProps,
} from "@/types";

const LARGE_SELECTOR_THRESHOLD = 10;

function getSelectionAssetCount(
  selection: ImportExportAssetPickerProps["selection"],
) {
  return selection.groups.reduce(
    (count, group) => count + group.assets.length,
    0,
  );
}

function flattenSelectionAssets(
  selection: ImportExportAssetPickerProps["selection"],
) {
  return selection.groups.flatMap((group) =>
    group.assets.map<ImportExportFlatSelectableAsset>((asset) => ({
      ...asset,
      searchText: `${asset.name} ${group.name} ${asset.subtitle}`.toLowerCase(),
    })),
  );
}

function MapThumbnail({ thumbnail, alt }: ImportExportMapThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = 68;
    const padding = 6;
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawingContext = context;

    canvas.width = size;
    canvas.height = size;
    drawingContext.clearRect(0, 0, size, size);
    drawingContext.fillStyle = "#10131a";
    drawingContext.fillRect(0, 0, size, size);
    drawingContext.fillStyle = "#17202b";
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        if ((x / 8 + y / 8) % 2 === 0) {
          drawingContext.fillRect(x, y, 8, 8);
        }
      }
    }

    let cancelled = false;

    async function drawPreview() {
      const loadedImages = new Map<string, HTMLImageElement>();

      for (const tileset of thumbnail.tilesets) {
        const url = await getAssetUrl(tileset.assetId);
        if (!url || cancelled) continue;

        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (!cancelled) {
            loadedImages.set(tileset.id, image);
          }
        } catch {
          // Ignore missing or invalid preview sources.
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      if (cancelled) return;

      const mapPixelSize = getMapPixelSize(thumbnail, 1);
      const scale = Math.min(
        (size - padding * 2) / Math.max(mapPixelSize.width, 1),
        (size - padding * 2) / Math.max(mapPixelSize.height, 1),
      );
      const renderScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const offsetX = (size - mapPixelSize.width * renderScale) / 2;
      const offsetY = (size - mapPixelSize.height * renderScale) / 2;

      for (const layer of thumbnail.layers) {
        if (!layer.visible) continue;

        for (const [position, ref] of Object.entries(layer.tiles)) {
          const [x, y] = position.split(",").map((value) => Number(value));
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

          const image = loadedImages.get(ref.tilesetId);
          if (!image) continue;

          const bounds = getMapCellBounds(thumbnail, 1, x, y);
          drawTileWithOrientation(
            drawingContext,
            image,
            ref,
            offsetX + bounds.x * renderScale,
            offsetY + bounds.y * renderScale,
            thumbnail.tileSize * renderScale,
          );
        }
      }

      drawingContext.strokeStyle = "rgba(255,255,255,0.08)";
      drawingContext.strokeRect(0.5, 0.5, size - 1, size - 1);
    }

    void drawPreview();

    return () => {
      cancelled = true;
    };
  }, [thumbnail]);

  return (
    <div
      role="img"
      aria-label={alt}
      className="flex size-17 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-visible bg-background shadow-sm"
    >
      <canvas ref={canvasRef} width={68} height={68} className="size-17" />
    </div>
  );
}

function TilesetThumbnail({
  thumbnail,
  alt,
}: ImportExportTilesetThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadPreview() {
      const url = await getAssetUrl(thumbnail.assetId);
      if (cancelled || !url) return;

      objectUrl = url;
      setImageUrl(url);
    }

    void loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [thumbnail.assetId]);

  return (
    <div className="relative flex size-17 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-visible bg-[#10131a] shadow-sm">
      <div className="absolute inset-0 bg-[linear-gradient(45deg,#17202b_25%,transparent_25%,transparent_75%,#17202b_75%,#17202b),linear-gradient(45deg,#17202b_25%,transparent_25%,transparent_75%,#17202b_75%,#17202b)] bg-size-[16px_16px] bg-position-[0_0,8px_8px] opacity-70" />
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          className="relative z-10 max-h-full max-w-full object-contain p-1"
        />
      ) : (
        <div className="relative z-10 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Preview
        </div>
      )}
    </div>
  );
}

function ExportAssetCard({
  asset,
  selected,
  onToggle,
}: ImportExportAssetCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(asset.id)}
      aria-pressed={selected}
      aria-label={`${selected ? "Deselect" : "Select"} ${asset.name}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none",
        selected
          ? "border-primary bg-primary/8 shadow-sm focus-visible:border-primary"
          : "border-border-visible bg-background hover:border-primary/40 hover:bg-secondary/40 focus-visible:border-primary",
      )}
    >
      {asset.thumbnail.kind === "map" ? (
        <MapThumbnail
          thumbnail={asset.thumbnail}
          alt={`${asset.name} preview`}
        />
      ) : (
        <TilesetThumbnail
          thumbnail={asset.thumbnail}
          alt={`${asset.name} preview`}
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="truncate text-sm font-medium text-foreground">
            {asset.name}
          </div>
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-visible bg-background text-transparent",
            )}
          >
            <Check className="size-3" />
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {asset.subtitle}
        </p>
      </div>
    </button>
  );
}

export function ExportAssetPicker({
  assetType,
  selection,
  selectedIds,
  onToggleAsset,
  onSelectAssets,
  onDeselectAssets,
}: ImportExportAssetPickerProps) {
  const totalAssetCount = getSelectionAssetCount(selection);

  return (
    <section className="space-y-4 rounded-2xl border border-border-visible bg-secondary/30 px-4 py-4">
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {assetType === "map" ? "Map selection" : "Tileset selection"}
        </div>
        <p className="text-sm text-foreground">
          {selection.helperText ?? "Choose which assets to export."}
        </p>
      </div>

      {selection.groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-visible bg-background/80 px-4 py-6 text-sm text-muted-foreground">
          {selection.emptyLabel ?? "Nothing is available to export yet."}
        </div>
      ) : totalAssetCount > LARGE_SELECTOR_THRESHOLD ? (
        <LargeExportAssetPicker
          assetType={assetType}
          selection={selection}
          selectedIds={selectedIds}
          onToggleAsset={onToggleAsset}
          onSelectAssets={onSelectAssets}
          onDeselectAssets={onDeselectAssets}
        />
      ) : (
        <div className="space-y-4">
          {selection.groups.map((group) => (
            <section key={group.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  {group.name}
                </h3>
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                  {group.assets.length} assets
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.assets.map((asset) => (
                  <ExportAssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selectedIds.includes(asset.id)}
                    onToggle={onToggleAsset}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function LargeExportAssetPicker({
  assetType,
  selection,
  selectedIds,
  onToggleAsset,
  onSelectAssets,
  onDeselectAssets,
}: ImportExportAssetPickerProps) {
  const searchInputId = useId();
  const [query, setQuery] = useState("");
  const flatAssets = useMemo(
    () => flattenSelectionAssets(selection),
    [selection],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAssets = useMemo(
    () =>
      normalizedQuery.length === 0
        ? flatAssets
        : flatAssets.filter((asset) =>
            asset.searchText.includes(normalizedQuery),
          ),
    [flatAssets, normalizedQuery],
  );
  const filteredAssetIds = filteredAssets.map((asset) => asset.id);
  const filteredSelectedCount = filteredAssetIds.filter((assetId) =>
    selectedIdSet.has(assetId),
  ).length;
  const isFiltered = normalizedQuery.length > 0;

  return (
    <div className="">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectAssets(filteredAssetIds)}
            className="rounded-full border border-border-visible bg-background px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-foreground transition-colors hover:border-primary/50 hover:bg-secondary/50 focus-visible:border-primary focus-visible:outline-none"
          >
            {isFiltered ? "Select filtered" : "Select all"}
          </button>
          <button
            type="button"
            onClick={() => onDeselectAssets(filteredAssetIds)}
            className="rounded-full border border-border-visible bg-background px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-foreground transition-colors hover:border-primary/50 hover:bg-secondary/50 focus-visible:border-primary focus-visible:outline-none"
          >
            {isFiltered ? "Clear filtered" : "Clear all"}
          </button>
          {isFiltered ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onSelectAssets(flatAssets.map((asset) => asset.id));
              }}
              className="rounded-full border border-border-visible bg-background px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-foreground transition-colors hover:border-primary/50 hover:bg-secondary/50 focus-visible:border-primary focus-visible:outline-none"
            >
              Select all assets
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative my-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchInputId}
            name={searchInputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search by ${assetType === "map" ? "map" : "tileset"} or group name`}
            className="pl-10 pr-10"
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {filteredAssets.length === 1
            ? "1 result"
            : `${filteredAssets.length} results`}
          {isFiltered ? `, ${filteredSelectedCount} selected in view` : ""}
        </div>
        <div>
          {selectedIds.length === 1
            ? "1 asset selected"
            : `${selectedIds.length} assets selected`}
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-visible bg-background px-4 py-6 text-sm text-muted-foreground">
          No matching {assetType === "map" ? "maps" : "tilesets"} found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-visible bg-background shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border-visible bg-secondary/40 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            <span>{assetType === "map" ? "Map" : "Tileset"}</span>
            <span className="hidden px-2 text-left sm:block sm:justify-self-start">
              Group
            </span>
            <span className="text-right">Status</span>
          </div>
          <ScrollArea className="h-50">
            <div className="divide-y divide-border-visible">
              {filteredAssets.map((asset) => {
                const isSelected = selectedIdSet.has(asset.id);

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onToggleAsset(asset.id)}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? "Deselect" : "Select"} ${asset.name}`}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]",
                      isSelected
                        ? "bg-primary/8"
                        : "hover:bg-secondary/50 focus-visible:bg-secondary/50",
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {asset.name}
                      </div>
                      <div className="sm:hidden">
                        <span className="inline-flex max-w-full rounded-full border border-border-visible bg-secondary/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          <span className="truncate">{asset.groupName}</span>
                        </span>
                      </div>
                    </div>
                    <div className="hidden min-w-0 sm:flex sm:justify-self-start sm:items-start sm:justify-start">
                      <span className="truncate rounded-full border border-border-visible bg-secondary/50 px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {asset.groupName}
                      </span>
                    </div>
                    <div className="flex items-center justify-end">
                      <span
                        className={cn(
                          "inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border-visible bg-background text-transparent",
                        )}
                      >
                        <Check className="size-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
