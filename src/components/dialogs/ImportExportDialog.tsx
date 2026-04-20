import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Download, Search, Upload, X } from "lucide-react";
import { drawTileWithOrientation } from "@/components/editor/MapCanvas/texture-cache";
import { Button } from "@/components/ui/Button";
import { getAssetUrl } from "@/lib/db";
import {
  DEFAULT_RASTER_EXPORT_OPTIONS,
  supportsRasterQuality,
  supportsRasterTransparency,
} from "@/lib/import-export-raster";
import { getMapCellBounds, getMapPixelSize } from "@/lib/map-geometry";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import type {
  ImportExportAssetCardProps,
  ImportExportFlatSelectableAsset,
  ImportExportAssetPickerProps,
  ImportExportAssetType,
  ImportExportDialogMode,
  ImportExportMapThumbnailProps,
  ImportExportRasterExportOptions,
  ImportExportRasterFileType,
  ImportExportOptionId,
  ImportExportOptionAction,
  ImportExportOptionDefinition,
  ImportExportSelectableAssetId,
  ImportExportTilesetThumbnailProps,
} from "@/types";
import type { ImportExportDialogProps } from "@/types/dialogs";

const optionDefinitions: ImportExportOptionDefinition[] = [
  {
    id: "project-native",
    assetType: "project",
    label: "2D Tiler Project (.2dp)",
    description: "Import or export Native 2D Tiler project files.",
    supportedNow: true,
  },
  {
    id: "project-tiled",
    assetType: "project",
    label: "Tiled Project (.tiled-project)",
    description: "Tiled multi-map project container.",
    supportedNow: false,
  },
  {
    id: "map-native",
    assetType: "map",
    label: "2D Tiler Map (.2dm)",
    description: "Import or export Native 2D Tiler map files.",
    supportedNow: true,
  },
  {
    id: "map-image",
    assetType: "map",
    label: "Image: PNG/JPG/WebP/BMP/GIF",
    description: "Raster image export and import targets.",
    supportedNow: true,
  },
  {
    id: "map-tiled-xml",
    assetType: "map",
    label: "Tiled XML Map File (.tmx, .xml)",
    description: "Tiled XML tile map format.",
    supportedNow: false,
  },
  {
    id: "map-tiled-json",
    assetType: "map",
    label: "Tiled JSON Map File (.tmj, .json)",
    description: "Tiled JSON tile map format.",
    supportedNow: false,
  },
  {
    id: "map-tiled-js",
    assetType: "map",
    label: "Tiled JavaScript Map File (.js)",
    description: "Tiled JavaScript export format.",
    supportedNow: false,
  },
  {
    id: "map-tiled-lua",
    assetType: "map",
    label: "Tiled Lua File (.lua)",
    description: "Tiled Lua export format.",
    supportedNow: false,
  },
  {
    id: "map-tiled-csv",
    assetType: "map",
    label: "Tiled CSV File (.csv)",
    description: "Tiled CSV tile layer format.",
    supportedNow: false,
  },
  {
    id: "map-godot",
    assetType: "map",
    label: "Godot 4 Scene File (.tscn)",
    description: "Godot 4 scene export target.",
    supportedNow: false,
  },
  {
    id: "map-unity",
    assetType: "map",
    label: "Unity",
    description: "Unity map export target.",
    supportedNow: false,
  },
  {
    id: "map-gamemaker-room",
    assetType: "map",
    label: "GameMaker room File (.room.gmx)",
    description: "GameMaker room file target.",
    supportedNow: false,
  },
  {
    id: "map-gamemaker-studio-2",
    assetType: "map",
    label: "GameMaker Studio 2 file (.yy)",
    description: "GameMaker Studio 2 room data.",
    supportedNow: false,
  },
  {
    id: "map-defold-tilemap",
    assetType: "map",
    label: "Defold Tile Map (.tilemap)",
    description: "Defold tile map resource.",
    supportedNow: false,
  },
  {
    id: "map-defold-collection",
    assetType: "map",
    label: "Defold Collection (.collection)",
    description: "Defold collection scene target.",
    supportedNow: false,
  },
  {
    id: "map-tide",
    assetType: "map",
    label: "tIDE Map Format (.tide)",
    description: "tIDE map export format.",
    supportedNow: false,
  },
  {
    id: "map-tbin",
    assetType: "map",
    label: "tBIN Map Format (.tbin)",
    description: "tIDE binary map export format.",
    supportedNow: false,
  },
  {
    id: "map-mappy-fmp",
    assetType: "map",
    label: "Mappy FMP (.fmp)",
    description: "Mappy FMP export format.",
    supportedNow: false,
  },
  {
    id: "tileset-native",
    assetType: "tileset",
    label: "2D Tiler Tileset (.2dt)",
    description: "Import or export native 2D Tiler tileset files.",
    supportedNow: true,
  },
  {
    id: "tileset-image",
    assetType: "tileset",
    label: "Image: PNG/JPG/WebP/BMP/GIF",
    description: "Raster image tileset target.",
    supportedNow: true,
  },
  {
    id: "tileset-tiled-xml",
    assetType: "tileset",
    label: "Tiled XML Tileset File (.tsx, .xml)",
    description: "Tiled XML tileset format.",
    supportedNow: false,
  },
  {
    id: "tileset-tiled-json",
    assetType: "tileset",
    label: "Tiled JSON Tileset File (.tsj, .json)",
    description: "Tiled JSON tileset format.",
    supportedNow: false,
  },
  {
    id: "tileset-tiled-lua",
    assetType: "tileset",
    label: "Tiled Lua File (.lua)",
    description: "Tiled Lua tileset format.",
    supportedNow: false,
  },
  {
    id: "tileset-unity",
    assetType: "tileset",
    label: "Unity (.asset)",
    description: "Unity tileset asset target.",
    supportedNow: false,
  },
  {
    id: "tileset-godot",
    assetType: "tileset",
    label: "Godot (.tres)",
    description: "Godot tileset resource format.",
    supportedNow: false,
  },
  {
    id: "tileset-rpg-maker",
    assetType: "tileset",
    label: "RPG Maker",
    description: "RPG Maker tileset target.",
    supportedNow: false,
  },
];

const assetTabs: ImportExportAssetType[] = ["project", "map", "tileset"];
const LARGE_SELECTOR_THRESHOLD = 10;
const RASTER_EXPORT_FORMAT_OPTIONS: {
  value: ImportExportRasterFileType;
  label: string;
}[] = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPG" },
  { value: "webp", label: "WebP" },
  { value: "bmp", label: "BMP" },
  { value: "gif", label: "GIF" },
];

function isRasterImageOption(optionId: ImportExportOptionId) {
  return optionId === "map-image" || optionId === "tileset-image";
}

function createInitialRasterExportOptionsState() {
  return {
    map: { ...DEFAULT_RASTER_EXPORT_OPTIONS },
    tileset: { ...DEFAULT_RASTER_EXPORT_OPTIONS },
  } satisfies Record<"map" | "tileset", ImportExportRasterExportOptions>;
}

function getRasterExportButtonLabel(format: ImportExportRasterFileType) {
  if (format === "jpg") return "Export as JPG";
  if (format === "webp") return "Export as WebP";
  return `Export as ${format.toUpperCase()}`;
}

interface RasterExportOptionsPanelProps {
  options: ImportExportRasterExportOptions;
  disabled: boolean;
  onOptionsChange: (options: ImportExportRasterExportOptions) => void;
  onExport: (options: ImportExportRasterExportOptions) => void;
}

function RasterExportOptionsPanel({
  options,
  disabled,
  onOptionsChange,
  onExport,
}: RasterExportOptionsPanelProps) {
  const formatSelectId = useId();
  const qualitySliderId = useId();
  const transparencySwitchId = useId();
  const qualitySupported = supportsRasterQuality(options.fileType);
  const transparencySupported = supportsRasterTransparency(options.fileType);

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/6 px-4 py-4">
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Export settings
        </div>
        <p className="text-sm text-foreground">
          Choose the raster file type and any format-specific options.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={formatSelectId} className="text-xs">
            File type
          </Label>
          <Select
            name={formatSelectId}
            value={options.fileType}
            onValueChange={(value) => {
              const fileType = value as ImportExportRasterFileType;
              onOptionsChange({
                ...options,
                fileType,
                transparency: supportsRasterTransparency(fileType)
                  ? options.transparency
                  : false,
              });
            }}
          >
            <SelectTrigger
              id={formatSelectId}
              className="h-10 w-full rounded-xl px-3"
            >
              <SelectValue placeholder="Choose a file type" />
            </SelectTrigger>
            <SelectContent>
              {RASTER_EXPORT_FORMAT_OPTIONS.map((formatOption) => (
                <SelectItem key={formatOption.value} value={formatOption.value}>
                  {formatOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {qualitySupported ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={qualitySliderId} className="text-xs">
                Compression quality
              </Label>
              <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                {Math.round(options.quality)}%
              </span>
            </div>
            <Slider
              id={qualitySliderId}
              name={qualitySliderId}
              min={1}
              max={100}
              step={1}
              value={[options.quality]}
              onValueChange={(value) => {
                const [quality = DEFAULT_RASTER_EXPORT_OPTIONS.quality] = value;
                onOptionsChange({ ...options, quality });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Lower quality creates smaller files. Higher quality preserves more
              detail.
            </p>
          </div>
        ) : transparencySupported ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={transparencySwitchId} className="text-xs">
                Enable Transparency
              </Label>
              <Switch
                id={transparencySwitchId}
                name={transparencySwitchId}
                checked={options.transparency}
                onCheckedChange={(checked) =>
                  onOptionsChange({ ...options, transparency: checked })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              If transparency is disabled, transparent areas will be filled with
              white in the exported image.
            </p>
          </div>
        ) : (
          <div></div>
        )}
      </div>

      {transparencySupported &&
      !qualitySupported ? null : transparencySupported ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-visible bg-background/80 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor={transparencySwitchId} className="text-xs">
              Enable transparency
            </Label>
            <p className="text-xs text-muted-foreground">
              If transparency is disabled, transparent areas will be filled with
              white in the exported image.
            </p>
          </div>
          <Switch
            id={transparencySwitchId}
            name={transparencySwitchId}
            checked={options.transparency}
            onCheckedChange={(checked) =>
              onOptionsChange({ ...options, transparency: checked })
            }
          />
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => onExport(options)}
          disabled={disabled}
        >
          {getRasterExportButtonLabel(options.fileType)}
        </Button>
      </div>
    </section>
  );
}

function getActionForAssetType(
  assetType: ImportExportAssetType,
  actions: Pick<
    ImportExportDialogProps,
    "projectAction" | "mapAction" | "tilesetAction"
  >,
): ImportExportOptionAction {
  if (assetType === "project") return actions.projectAction;
  if (assetType === "map") return actions.mapAction;
  return actions.tilesetAction;
}

function getModeCopy(mode: ImportExportDialogMode) {
  if (mode === "import") {
    return {
      title: "Import assets",
      icon: Upload,
    };
  }

  return {
    title: "Export assets",
    icon: Download,
  };
}

function getInitialSelectedIds(action: ImportExportOptionAction) {
  return action.exportSelection?.initialSelectedIds ?? [];
}

function createSelectedIdsState(
  actions: Pick<ImportExportDialogProps, "mapAction" | "tilesetAction">,
) {
  return {
    project: [] as ImportExportSelectableAssetId[],
    map: getInitialSelectedIds(actions.mapAction),
    tileset: getInitialSelectedIds(actions.tilesetAction),
  };
}

function getAvailableSelectionIds(action: ImportExportOptionAction) {
  return new Set(
    (action.exportSelection?.groups ?? []).flatMap((group) =>
      group.assets.map((asset) => asset.id),
    ),
  );
}

function syncSelectedIds(
  action: ImportExportOptionAction,
  selectedIds: ImportExportSelectableAssetId[],
) {
  const availableIds = getAvailableSelectionIds(action);
  return selectedIds.filter((selectedId) => availableIds.has(selectedId));
}

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

function ExportAssetPicker({
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

export function ImportExportDialog({
  open,
  onOpenChange,
  mode,
  projectAction,
  mapAction,
  tilesetAction,
}: ImportExportDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportExportAssetType>("project");
  const [selectedIdsByAssetType, setSelectedIdsByAssetType] = useState(() =>
    createSelectedIdsState({ mapAction, tilesetAction }),
  );
  const [expandedRasterOptionId, setExpandedRasterOptionId] =
    useState<ImportExportOptionId | null>(null);
  const [rasterExportOptionsByAssetType, setRasterExportOptionsByAssetType] =
    useState(createInitialRasterExportOptionsState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modeCopy = getModeCopy(mode);
  const ModeIcon = modeCopy.icon;

  useEffect(() => {
    if (!open || mode !== "export") return;

    setSelectedIdsByAssetType({
      project: [],
      map: syncSelectedIds(mapAction, getInitialSelectedIds(mapAction)),
      tileset: syncSelectedIds(
        tilesetAction,
        getInitialSelectedIds(tilesetAction),
      ),
    });
  }, [mode, open, mapAction, tilesetAction]);

  useEffect(() => {
    if (!open) {
      setExpandedRasterOptionId(null);
      setRasterExportOptionsByAssetType(
        createInitialRasterExportOptionsState(),
      );
    }
  }, [open]);

  async function handleActionSelect(
    action: ImportExportOptionAction,
    selectedIds: ImportExportSelectableAssetId[],
    optionId: ImportExportOptionId,
    rasterExportOptions?: ImportExportRasterExportOptions,
  ) {
    setIsSubmitting(true);

    try {
      if (mode === "export" && action.exportSelection) {
        await action.exportSelection.onSubmit(
          selectedIds,
          optionId,
          rasterExportOptions,
        );
      } else {
        await action.onSelect?.(optionId, rasterExportOptions);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("[ImportExportDialog] Action failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggleAsset(
    assetType: ImportExportAssetType,
    assetId: ImportExportSelectableAssetId,
  ) {
    setSelectedIdsByAssetType((currentState) => {
      const nextSelectedIds = currentState[assetType].includes(assetId)
        ? currentState[assetType].filter(
            (currentAssetId) => currentAssetId !== assetId,
          )
        : [...currentState[assetType], assetId];

      return {
        ...currentState,
        [assetType]: nextSelectedIds,
      };
    });
  }

  function handleSelectAssets(
    assetType: ImportExportAssetType,
    assetIds: ImportExportSelectableAssetId[],
  ) {
    if (assetIds.length === 0) return;

    setSelectedIdsByAssetType((currentState) => {
      const nextSelectedIdSet = new Set(currentState[assetType]);

      for (const assetId of assetIds) {
        nextSelectedIdSet.add(assetId);
      }

      return {
        ...currentState,
        [assetType]: [...nextSelectedIdSet],
      };
    });
  }

  function handleDeselectAssets(
    assetType: ImportExportAssetType,
    assetIds: ImportExportSelectableAssetId[],
  ) {
    if (assetIds.length === 0) return;

    setSelectedIdsByAssetType((currentState) => ({
      ...currentState,
      [assetType]: currentState[assetType].filter(
        (currentAssetId) => !assetIds.includes(currentAssetId),
      ),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-2.5rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader className="gap-3 border-b border-border bg-linear-to-r from-secondary/70 via-background to-background px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-visible bg-background/80 text-foreground shadow-sm">
              <ModeIcon className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {mode === "import" ? "File intake" : "File delivery"}
              </div>
              <DialogTitle>{modeCopy.title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as ImportExportAssetType)
          }
          className="min-h-0 flex-1 overflow-hidden"
        >
          <div className="border-b border-border bg-background px-6 pt-4">
            <TabsList variant="line" className="w-full justify-start">
              {assetTabs.map((assetType) => (
                <TabsTrigger
                  key={assetType}
                  value={assetType}
                  className="capitalize"
                >
                  {assetType}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {assetTabs.map((assetType) => {
            const assetOptions = optionDefinitions.filter(
              (option) => option.assetType === assetType,
            );
            const action = getActionForAssetType(assetType, {
              projectAction,
              mapAction,
              tilesetAction,
            });
            const exportSelection =
              mode === "export" ? action.exportSelection : undefined;
            const selectedIds = selectedIdsByAssetType[assetType] ?? [];
            const rasterExportOptions =
              assetType === "project"
                ? null
                : rasterExportOptionsByAssetType[assetType];

            return (
              <TabsContent
                key={assetType}
                value={assetType}
                className="min-h-0 flex-1 overflow-hidden"
              >
                <ScrollArea className="h-full min-h-0">
                  <div className="space-y-3 px-6 py-5">
                    {exportSelection ? (
                      <ExportAssetPicker
                        assetType={assetType}
                        selection={exportSelection}
                        selectedIds={selectedIds}
                        onToggleAsset={(assetId) =>
                          handleToggleAsset(assetType, assetId)
                        }
                        onSelectAssets={(assetIds) =>
                          handleSelectAssets(assetType, assetIds)
                        }
                        onDeselectAssets={(assetIds) =>
                          handleDeselectAssets(assetType, assetIds)
                        }
                      />
                    ) : null}

                    {assetOptions.map((option) => {
                      const isRasterOption =
                        mode === "export" && isRasterImageOption(option.id);
                      const hasSelection =
                        exportSelection === undefined || selectedIds.length > 0;
                      const isEnabled =
                        option.supportedNow &&
                        action.enabled &&
                        Boolean(
                          exportSelection
                            ? exportSelection.onSubmit
                            : action.onSelect,
                        ) &&
                        hasSelection &&
                        !isSubmitting;
                      const statusLabel = option.supportedNow
                        ? isEnabled
                          ? mode === "import"
                            ? "Import now"
                            : exportSelection && selectedIds.length > 1
                              ? `${selectedIds.length} selected`
                              : "Export now"
                          : exportSelection && !hasSelection
                            ? "Select at least one"
                            : (action.disabledReason ?? "Unavailable")
                        : "Coming Soon";

                      return (
                        <div key={option.id} className="space-y-3">
                          <button
                            type="button"
                            disabled={!isEnabled}
                            onClick={() => {
                              if (!isEnabled) return;
                              if (isRasterOption) {
                                setExpandedRasterOptionId((currentValue) =>
                                  currentValue === option.id ? null : option.id,
                                );
                                return;
                              }
                              void handleActionSelect(
                                action,
                                selectedIds,
                                option.id,
                              );
                            }}
                            aria-label={`${mode === "import" ? "Import" : "Export"} ${option.label}`}
                            className={cn(
                              "flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors",
                              isEnabled
                                ? "border-border-visible bg-background shadow-sm hover:border-primary/50 hover:bg-secondary/60 focus-visible:border-primary focus-visible:outline-none"
                                : option.supportedNow
                                  ? "cursor-not-allowed border-border/70 bg-muted/20 text-muted-foreground"
                                  : "cursor-not-allowed border-dashed border-border-visible bg-secondary/25 text-muted-foreground",
                            )}
                          >
                            <div className="min-w-0 space-y-1">
                              <div
                                className={cn(
                                  "text-sm font-medium",
                                  isEnabled
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {option.label}
                              </div>
                              <p
                                className={cn(
                                  "text-xs leading-5",
                                  isEnabled
                                    ? "text-muted-foreground"
                                    : "text-muted-foreground/80",
                                )}
                              >
                                {option.description}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.08em]",
                                isEnabled
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : option.supportedNow
                                    ? "border-border-visible bg-background/80 text-muted-foreground"
                                    : "border-border-visible bg-background/80 text-muted-foreground",
                              )}
                            >
                              {statusLabel}
                            </span>
                          </button>

                          {isRasterOption &&
                          expandedRasterOptionId === option.id &&
                          rasterExportOptions ? (
                            <RasterExportOptionsPanel
                              options={rasterExportOptions}
                              disabled={!isEnabled}
                              onOptionsChange={(nextOptions) =>
                                setRasterExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    [assetType]: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}
        </Tabs>

        <DialogFooter
          className="border-t border-border px-6 py-4"
          showCloseButton
        />
      </DialogContent>
    </Dialog>
  );
}
