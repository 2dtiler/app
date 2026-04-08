import { memo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROPERTY_TYPES, type PropertyValue, type TileMapData } from "@/types";
import type {
  EditablePropertyEntry,
  MapOptionsDialogProps,
} from "@/types/dialogs";

function mapPropertiesToEntries(
  properties: TileMapData["properties"],
): EditablePropertyEntry[] {
  return Object.entries(properties ?? {}).map(([key, propertyValue]) => ({
    key,
    value:
      typeof propertyValue === "string" ? propertyValue : propertyValue.value,
    type: typeof propertyValue === "string" ? "string" : propertyValue.type,
  }));
}

function buildPropertyRecord(
  entries: EditablePropertyEntry[],
): Record<string, PropertyValue> {
  const properties: Record<string, PropertyValue> = {};

  for (const { key, value, type } of entries) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    properties[trimmedKey] = { value, type };
  }

  return properties;
}

function clampMapDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(256, Math.max(1, Math.round(value)));
}

export const MapOptionsDialog = memo(function MapOptionsDialog({
  open,
  onOpenChange,
  map,
  onSave,
}: MapOptionsDialogProps) {
  const [width, setWidth] = useState(map.widthInTiles);
  const [height, setHeight] = useState(map.heightInTiles);
  const [entries, setEntries] = useState<EditablePropertyEntry[]>(() =>
    mapPropertiesToEntries(map.properties),
  );

  function handleAddProperty() {
    setEntries((prev) => [...prev, { key: "", value: "", type: "string" }]);
  }

  function handleRemoveProperty(index: number) {
    setEntries((prev) => prev.filter((_, entryIndex) => entryIndex !== index));
  }

  function handlePropertyKeyChange(index: number, value: string) {
    setEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, key: value } : entry,
      ),
    );
  }

  function handlePropertyTypeChange(
    index: number,
    value: EditablePropertyEntry["type"],
  ) {
    setEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, type: value } : entry,
      ),
    );
  }

  function handlePropertyValueChange(index: number, value: string) {
    setEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, value } : entry,
      ),
    );
  }

  function handleApply() {
    onSave(width, height, buildPropertyRecord(entries));
  }

  const displayWidth = clampMapDimension(width, map.widthInTiles);
  const displayHeight = clampMapDimension(height, map.heightInTiles);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-160">
        <DialogHeader>
          <DialogTitle>Map Options — {map.name}</DialogTitle>
          <DialogDescription>
            Edit map dimensions and custom properties for this map.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="map-options-width" className="text-xs">
                Width (tiles)
              </Label>
              <Input
                id="map-options-width"
                name="map-options-width"
                type="number"
                min={1}
                max={256}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="map-options-height" className="text-xs">
                Height (tiles)
              </Label>
              <Input
                id="map-options-height"
                name="map-options-height"
                type="number"
                min={1}
                max={256}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Pixel size: {displayWidth * map.tileSize} × {displayHeight * map.tileSize}px
          </p>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Custom Properties</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onMouseDown={handleAddProperty}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>

            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No custom properties. Click &quot;Add&quot; to create one.
              </p>
            )}

            {entries.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  id={`map-property-key-${index}`}
                  name={`map-property-key-${index}`}
                  aria-label={`Map property ${index + 1} key`}
                  placeholder="Key"
                  value={entry.key}
                  onChange={(e) => handlePropertyKeyChange(index, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Select
                  name={`map-property-type-${index}`}
                  value={entry.type}
                  onValueChange={(value) =>
                    handlePropertyTypeChange(
                      index,
                      value as EditablePropertyEntry["type"],
                    )
                  }
                >
                  <SelectTrigger
                    id={`map-property-type-${index}`}
                    aria-label={`Map property ${index + 1} type`}
                    className="w-22 h-7 text-xs shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((propertyType) => (
                      <SelectItem
                        key={propertyType}
                        value={propertyType}
                        className="text-xs"
                      >
                        {propertyType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id={`map-property-value-${index}`}
                  name={`map-property-value-${index}`}
                  aria-label={`Map property ${index + 1} value`}
                  placeholder="Value"
                  value={entry.value}
                  onChange={(e) => handlePropertyValueChange(index, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive shrink-0"
                  onMouseDown={() => handleRemoveProperty(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onMouseDown={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onMouseDown={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});