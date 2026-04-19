import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";
import { PROPERTY_TYPES, type PropertyType, type PropertyValue } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type {
  EditablePropertyEntry,
  ObjectPropertiesDialogProps,
} from "@/types/dialogs";

function objectPropertiesToEntries(
  properties: Record<string, PropertyValue>,
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

export function ObjectPropertiesDialog({
  open,
  onOpenChange,
  object,
  onSave,
}: ObjectPropertiesDialogProps) {
  const [name, setName] = useState(object.name);
  const [entries, setEntries] = useState<EditablePropertyEntry[]>(() =>
    objectPropertiesToEntries(object.properties),
  );

  function handleAddProperty() {
    setEntries((prev) => [
      ...prev,
      { key: "", value: "", type: "string" as PropertyType },
    ]);
  }

  function handleRemoveProperty(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyChange(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, key: value } : e)),
    );
  }

  function handleValueChange(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, value: value } : e)),
    );
  }

  function handleTypeChange(index: number, type: PropertyType) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, type } : e)),
    );
  }

  function handleSave() {
    onSave(buildPropertyRecord(entries), name.trim() || object.name);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-140">
        <DialogHeader>
          <DialogTitle>Object Properties</DialogTitle>
          <DialogDescription>
            Edit the name and custom properties of this {object.type} object.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Object name */}
          <div className="space-y-1">
            <Label htmlFor="object-name" className="text-xs">
              Name
            </Label>
            <Input
              id="object-name"
              name="object-name"
              aria-label="Object name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Read-only type info */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Type: <strong className="text-foreground">{object.type}</strong>
            </span>
            <span>
              Position: ({Math.round(object.x)}, {Math.round(object.y)})
            </span>
            {object.type !== "point" && (
              <span>
                Size: {Math.round(object.width)} × {Math.round(object.height)}
              </span>
            )}
          </div>

          <Separator />

          {/* Custom properties */}
          <div className="space-y-2">
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

            {entries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  id={`property-key-${idx}`}
                  name={`property-key-${idx}`}
                  aria-label={`Object property ${idx + 1} key`}
                  placeholder="Key"
                  value={entry.key}
                  onChange={(e) => handleKeyChange(idx, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Select
                  name={`property-type-${idx}`}
                  value={entry.type}
                  onValueChange={(v) =>
                    handleTypeChange(idx, v as PropertyType)
                  }
                >
                  <SelectTrigger
                    id={`property-type-${idx}`}
                    aria-label={`Object property ${idx + 1} type`}
                    className="w-22 h-7 text-xs shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id={`property-value-${idx}`}
                  name={`property-value-${idx}`}
                  aria-label={`Object property ${idx + 1} value`}
                  placeholder="Value"
                  value={entry.value}
                  onChange={(e) => handleValueChange(idx, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove object property ${idx + 1}`}
                  className="h-7 w-7 text-destructive shrink-0"
                  onMouseDown={() => handleRemoveProperty(idx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onMouseDown={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
