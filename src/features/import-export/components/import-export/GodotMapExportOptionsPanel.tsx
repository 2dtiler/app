import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type {
  GodotMapExportOptions,
  GodotMapExportOptionsPanelProps,
  GodotMapTilesetMode,
} from "@/types";

const GODOT_TILESET_MODE_OPTIONS: {
  value: GodotMapTilesetMode;
  label: string;
  description: string;
}[] = [
  {
    value: "embedded",
    label: "Embedded TileSet resource",
    description: "Write the TileSet inside the exported .tscn scene.",
  },
  {
    value: "external",
    label: "External TileSet resource (.tres)",
    description:
      "Write the TileSet as a separate .tres resource next to the scene.",
  },
];

function getGodotExportButtonLabel(options: GodotMapExportOptions) {
  return options.tilesetMode === "external"
    ? "Export Godot scene bundle"
    : "Export Godot scene";
}

export function GodotMapExportOptionsPanel({
  options,
  disabled,
  onOptionsChange,
  onExport,
}: GodotMapExportOptionsPanelProps) {
  const sceneRootNameId = useId();
  const tilesetModeId = useId();

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/6 px-4 py-4">
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Export settings
        </div>
        <p className="text-sm text-foreground">
          Configure how the Godot 4 scene names its root node and whether the
          TileSet is embedded in the scene or written as a linked .tres file.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={sceneRootNameId} className="text-xs">
            Scene root name
          </Label>
          <Input
            id={sceneRootNameId}
            name={sceneRootNameId}
            type="text"
            value={options.sceneRootName}
            onChange={(event) =>
              onOptionsChange({
                ...options,
                sceneRootName: event.target.value,
              })
            }
            placeholder="Leave blank to use the map name"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Leave this empty to reuse the current map name as the Godot scene
            root.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={tilesetModeId} className="text-xs">
            TileSet output
          </Label>
          <Select
            name={tilesetModeId}
            value={options.tilesetMode}
            onValueChange={(value) =>
              onOptionsChange({
                ...options,
                tilesetMode: value as GodotMapTilesetMode,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger
              id={tilesetModeId}
              className="h-10 w-full rounded-xl px-3"
            >
              <SelectValue placeholder="Choose TileSet output" />
            </SelectTrigger>
            <SelectContent>
              {GODOT_TILESET_MODE_OPTIONS.map((tilesetModeOption) => (
                <SelectItem
                  key={tilesetModeOption.value}
                  value={tilesetModeOption.value}
                >
                  {tilesetModeOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {
              GODOT_TILESET_MODE_OPTIONS.find(
                (tilesetModeOption) =>
                  tilesetModeOption.value === options.tilesetMode,
              )?.description
            }
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-border-visible bg-background/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">Texture handling</Label>
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
              Copy
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Godot export currently copies linked image assets into the exported
            scene bundle.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => onExport(options)}
          disabled={disabled}
        >
          {getGodotExportButtonLabel(options)}
        </Button>
      </div>
    </section>
  );
}
