import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import type {
  TiledLayerCompression,
  TiledLayerEncoding,
  TiledMapExportFormat,
  TiledMapExportOptionsPanelProps,
  TiledRenderOrder,
  TiledTilesetMode,
} from "@/types";

const TILED_MAP_EXPORT_FORMAT_OPTIONS: {
  value: TiledMapExportFormat;
  label: string;
}[] = [
  { value: "xml", label: "XML Map bundle (.tmx, .xml)" },
  { value: "json", label: "JSON Map bundle (.tmj, .json)" },
  { value: "js", label: "JavaScript Map bundle (.js)" },
  { value: "lua", label: "Lua Map bundle (.lua)" },
  { value: "csv", label: "CSV tile layers (.csv)" },
];

const TILED_LAYER_ENCODING_OPTIONS: {
  value: TiledLayerEncoding;
  label: string;
}[] = [
  { value: "base64", label: "Base64" },
  { value: "csv", label: "CSV" },
];

const TILED_LAYER_COMPRESSION_OPTIONS: {
  value: TiledLayerCompression;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "gzip", label: "Gzip" },
  { value: "zlib", label: "Zlib" },
];

const TILED_TILESET_MODE_OPTIONS: {
  value: TiledTilesetMode;
  label: string;
}[] = [
  { value: "external", label: "External tileset files" },
  { value: "inline", label: "Inline tilesets" },
];

const TILED_RENDER_ORDER_OPTIONS: {
  value: TiledRenderOrder;
  label: string;
}[] = [
  { value: "right-down", label: "Right then down" },
  { value: "right-up", label: "Right then up" },
  { value: "left-down", label: "Left then down" },
  { value: "left-up", label: "Left then up" },
];

function getExportButtonLabel(format: TiledMapExportFormat) {
  if (format === "csv") {
    return "Export CSV files";
  }

  return "Export Tiled bundle";
}

function getFormatDescription(format: TiledMapExportFormat) {
  if (format === "csv") {
    return "CSV export writes one file per tile layer and does not include map metadata, linked images, or tileset bundle settings.";
  }

  return "Configure layer encoding, compression, tileset layout, and render order for the generated Tiled bundle.";
}

export function TiledMapExportOptionsPanel({
  options,
  disabled,
  supportsRenderOrder,
  onOptionsChange,
  onExport,
}: TiledMapExportOptionsPanelProps) {
  const formatSelectId = useId();
  const encodingSelectId = useId();
  const compressionSelectId = useId();
  const compressionLevelId = useId();
  const tilesetModeId = useId();
  const renderOrderId = useId();
  const usesStructuredBundleOptions = options.format !== "csv";
  const compressionEnabled =
    usesStructuredBundleOptions && options.encoding === "base64";
  const levelEnabled = compressionEnabled && options.compression !== "none";

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/6 px-4 py-4">
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Export settings
        </div>
        <p className="text-sm text-foreground">
          {getFormatDescription(options.format)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={formatSelectId} className="text-xs">
          Tiled export format
        </Label>
        <Select
          name={formatSelectId}
          value={options.format}
          onValueChange={(value) =>
            onOptionsChange({
              ...options,
              format: value as TiledMapExportFormat,
            })
          }
        >
          <SelectTrigger
            id={formatSelectId}
            className="h-10 w-full rounded-xl px-3"
          >
            <SelectValue placeholder="Choose format" />
          </SelectTrigger>
          <SelectContent>
            {TILED_MAP_EXPORT_FORMAT_OPTIONS.map((formatOption) => (
              <SelectItem key={formatOption.value} value={formatOption.value}>
                {formatOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {usesStructuredBundleOptions ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={encodingSelectId} className="text-xs">
              Layer encoding
            </Label>
            <Select
              name={encodingSelectId}
              value={options.encoding}
              onValueChange={(value) => {
                const encoding = value as TiledLayerEncoding;
                onOptionsChange({
                  ...options,
                  encoding,
                  compression:
                    encoding === "base64" ? options.compression : "none",
                });
              }}
            >
              <SelectTrigger
                id={encodingSelectId}
                className="h-10 w-full rounded-xl px-3"
              >
                <SelectValue placeholder="Choose encoding" />
              </SelectTrigger>
              <SelectContent>
                {TILED_LAYER_ENCODING_OPTIONS.map((encodingOption) => (
                  <SelectItem
                    key={encodingOption.value}
                    value={encodingOption.value}
                  >
                    {encodingOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={compressionSelectId} className="text-xs">
              Base64 compression
            </Label>
            <Select
              name={compressionSelectId}
              value={options.compression}
              onValueChange={(value) =>
                onOptionsChange({
                  ...options,
                  compression: value as TiledLayerCompression,
                })
              }
              disabled={!compressionEnabled}
            >
              <SelectTrigger
                id={compressionSelectId}
                className="h-10 w-full rounded-xl px-3"
              >
                <SelectValue placeholder="Choose compression" />
              </SelectTrigger>
              <SelectContent>
                {TILED_LAYER_COMPRESSION_OPTIONS.map((compressionOption) => (
                  <SelectItem
                    key={compressionOption.value}
                    value={compressionOption.value}
                  >
                    {compressionOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={compressionLevelId} className="text-xs">
                Compression level
              </Label>
              <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                {options.compressionLevel}
              </span>
            </div>
            <Slider
              id={compressionLevelId}
              name={compressionLevelId}
              min={0}
              max={9}
              step={1}
              value={[options.compressionLevel]}
              disabled={!levelEnabled}
              onValueChange={(value) => {
                const [compressionLevel = options.compressionLevel] = value;
                onOptionsChange({ ...options, compressionLevel });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Lower values write faster. Higher values create smaller bundled
              payloads.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={tilesetModeId} className="text-xs">
              Tileset source
            </Label>
            <Select
              name={tilesetModeId}
              value={options.tilesetMode}
              onValueChange={(value) =>
                onOptionsChange({
                  ...options,
                  tilesetMode: value as TiledTilesetMode,
                })
              }
            >
              <SelectTrigger
                id={tilesetModeId}
                className="h-10 w-full rounded-xl px-3"
              >
                <SelectValue placeholder="Choose tileset mode" />
              </SelectTrigger>
              <SelectContent>
                {TILED_TILESET_MODE_OPTIONS.map((tilesetModeOption) => (
                  <SelectItem
                    key={tilesetModeOption.value}
                    value={tilesetModeOption.value}
                  >
                    {tilesetModeOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={renderOrderId} className="text-xs">
              Tile render order
            </Label>
            <Select
              name={renderOrderId}
              value={options.renderOrder}
              onValueChange={(value) =>
                onOptionsChange({
                  ...options,
                  renderOrder: value as TiledRenderOrder,
                })
              }
              disabled={!supportsRenderOrder}
            >
              <SelectTrigger
                id={renderOrderId}
                className="h-10 w-full rounded-xl px-3"
              >
                <SelectValue placeholder="Choose render order" />
              </SelectTrigger>
              <SelectContent>
                {TILED_RENDER_ORDER_OPTIONS.map((renderOrderOption) => (
                  <SelectItem
                    key={renderOrderOption.value}
                    value={renderOrderOption.value}
                  >
                    {renderOrderOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {supportsRenderOrder
                ? "Only orthogonal Tiled maps use this field."
                : "Render order is only written for orthogonal maps in Tiled."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-xs text-muted-foreground">
          CSV export only writes dense tile-layer data. Layer encoding,
          compression, render order, and tileset bundling are not available for
          this format.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={() => onExport(options)} disabled={disabled}>
          {getExportButtonLabel(options.format)}
        </Button>
      </div>
    </section>
  );
}