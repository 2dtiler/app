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
import type {
  TiledTilesetExportOptionsPanelProps,
  TiledTilesetFormat,
} from "@/types";

const TILED_TILESET_EXPORT_FORMAT_OPTIONS: {
  value: TiledTilesetFormat;
  label: string;
}[] = [
  { value: "xml", label: "XML Tileset bundle (.tsx, .xml)" },
  { value: "json", label: "JSON Tileset bundle (.tsj, .json)" },
  { value: "lua", label: "Lua Tileset bundle (.lua)" },
];

function getFormatDescription(format: TiledTilesetFormat) {
  if (format === "json") {
    return "Export a standalone Tiled JSON tileset with its linked image asset in one bundle.";
  }

  if (format === "lua") {
    return "Export a standalone Tiled Lua tileset with its linked image asset in one bundle.";
  }

  return "Export a standalone Tiled XML tileset with its linked image asset in one bundle.";
}

export function TiledTilesetExportOptionsPanel({
  options,
  disabled,
  onOptionsChange,
  onExport,
}: TiledTilesetExportOptionsPanelProps) {
  const formatSelectId = useId();

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
              format: value as TiledTilesetFormat,
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
            {TILED_TILESET_EXPORT_FORMAT_OPTIONS.map((formatOption) => (
              <SelectItem key={formatOption.value} value={formatOption.value}>
                {formatOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => onExport(options)}
          disabled={disabled}
        >
          Export Tiled bundle
        </Button>
      </div>
    </section>
  );
}
