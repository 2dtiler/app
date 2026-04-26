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
  DefoldMapExportOptions,
  DefoldMapExportOptionsPanelProps,
  DefoldMapFormat,
} from "@/types";

const DEFOLD_MAP_FORMAT_OPTIONS: {
  value: DefoldMapFormat;
  label: string;
  description: string;
}[] = [
  {
    value: "collection",
    label: "Defold Collection (.collection)",
    description:
      "Wrap the exported map in a Defold collection that references a generated tilemap resource.",
  },
  {
    value: "tilemap",
    label: "Defold Tile Map (.tilemap)",
    description:
      "Write the exported map as a standalone Defold tilemap resource.",
  },
];

function getExportButtonLabel(options: DefoldMapExportOptions) {
  return options.format === "collection"
    ? "Export collection"
    : "Export tilemap";
}

export function DefoldMapExportOptionsPanel({
  options,
  disabled,
  onOptionsChange,
  onExport,
}: DefoldMapExportOptionsPanelProps) {
  const formatSelectId = useId();

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/6 px-4 py-4">
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Export settings
        </div>
        <p className="text-sm text-foreground">
          Choose whether this Defold export should produce a standalone tilemap
          or a collection wrapper that references a generated tilemap.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={formatSelectId} className="text-xs">
          Defold export format
        </Label>
        <Select
          name={formatSelectId}
          value={options.format}
          onValueChange={(value) =>
            onOptionsChange({
              ...options,
              format: value as DefoldMapFormat,
            })
          }
          disabled={disabled}
        >
          <SelectTrigger
            id={formatSelectId}
            className="h-10 w-full rounded-xl px-3"
          >
            <SelectValue placeholder="Choose format" />
          </SelectTrigger>
          <SelectContent>
            {DEFOLD_MAP_FORMAT_OPTIONS.map((formatOption) => (
              <SelectItem key={formatOption.value} value={formatOption.value}>
                {formatOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {
            DEFOLD_MAP_FORMAT_OPTIONS.find(
              (formatOption) => formatOption.value === options.format,
            )?.description
          }
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => onExport(options)}
          disabled={disabled}
        >
          {getExportButtonLabel(options)}
        </Button>
      </div>
    </section>
  );
}
