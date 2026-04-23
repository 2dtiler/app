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
import { Switch } from "@/components/ui/Switch";
import {
  DEFAULT_RASTER_EXPORT_OPTIONS,
  supportsRasterQuality,
  supportsRasterTransparency,
} from "@/lib/import-export-raster";
import type {
  ImportExportRasterExportOptions,
  ImportExportRasterFileType,
  RasterExportOptionsPanelProps,
} from "@/types";

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

function getRasterExportButtonLabel(format: ImportExportRasterFileType) {
  if (format === "jpg") return "Export as JPG";
  if (format === "webp") return "Export as WebP";
  return `Export as ${format.toUpperCase()}`;
}

export function RasterExportOptionsPanel({
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
          onClick={() => onExport(options as ImportExportRasterExportOptions)}
          disabled={disabled}
        >
          {getRasterExportButtonLabel(options.fileType)}
        </Button>
      </div>
    </section>
  );
}
