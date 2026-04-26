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
  GameMakerMapExportOptions,
  GameMakerMapExportOptionsPanelProps,
  GameMakerMapFormat,
} from "@/types";

const GAME_MAKER_MAP_FORMAT_OPTIONS: {
  value: GameMakerMapFormat;
  label: string;
  description: string;
}[] = [
  {
    value: "yy",
    label: "GameMaker Studio 2 room (.yy)",
    description:
      "Write the room as modern GameMaker JSON compatible with Studio 2 projects.",
  },
  {
    value: "gmx",
    label: "Legacy GameMaker room (.room.gmx)",
    description:
      "Write the room as legacy GameMaker XML for older GMX-based projects.",
  },
];

function getExportButtonLabel(options: GameMakerMapExportOptions) {
  return options.format === "gmx" ? "Export GMX room" : "Export YY room";
}

export function GameMakerMapExportOptionsPanel({
  options,
  disabled,
  onOptionsChange,
  onExport,
}: GameMakerMapExportOptionsPanelProps) {
  const formatSelectId = useId();

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/6 px-4 py-4">
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Export settings
        </div>
        <p className="text-sm text-foreground">
          Choose whether to export a legacy GMX room file or a modern GameMaker
          Studio 2 YY room file from this single GameMaker option.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={formatSelectId} className="text-xs">
          GameMaker export format
        </Label>
        <Select
          name={formatSelectId}
          value={options.format}
          onValueChange={(value) =>
            onOptionsChange({
              ...options,
              format: value as GameMakerMapFormat,
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
            {GAME_MAKER_MAP_FORMAT_OPTIONS.map((formatOption) => (
              <SelectItem key={formatOption.value} value={formatOption.value}>
                {formatOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {
            GAME_MAKER_MAP_FORMAT_OPTIONS.find(
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
