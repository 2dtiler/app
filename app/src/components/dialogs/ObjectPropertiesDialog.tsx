import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { MapObject, PropertyType, PropertyValue } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROPERTY_TYPES: PropertyType[] = [
  "bool",
  "color",
  "float",
  "file",
  "int",
  "object",
  "string",
];

interface ObjectPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object: MapObject;
  onSave: (properties: Record<string, PropertyValue>, name?: string) => void;
}

export function ObjectPropertiesDialog({
  open,
  onOpenChange,
  object,
  onSave,
}: ObjectPropertiesDialogProps) {
  const [name, setName] = useState(object.name);
  const [entries, setEntries] = useState<
    { key: string; value: string; type: PropertyType }[]
  >([]);

  // Sync local state when dialog opens or object changes (render-time
  // adjustment avoids the "setState in effect" cascading-render lint error).
  const [prevSyncDeps, setPrevSyncDeps] = useState({ open, object });
  if (open && (open !== prevSyncDeps.open || object !== prevSyncDeps.object)) {
    setPrevSyncDeps({ open, object });
    setName(object.name);
    setEntries(
      Object.entries(object.properties ?? {}).map(([key, pv]) => ({
        key,
        value: typeof pv === "string" ? pv : pv.value,
        type: (typeof pv === "string" ? "string" : pv.type) as PropertyType,
      })),
    );
  } else if (open !== prevSyncDeps.open || object !== prevSyncDeps.object) {
    setPrevSyncDeps({ open, object });
  }

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
    const properties: Record<string, PropertyValue> = {};
    for (const { key, value, type } of entries) {
      const trimmedKey = key.trim();
      if (trimmedKey) {
        properties[trimmedKey] = { value, type };
      }
    }
    onSave(properties, name.trim() || object.name);
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
            <Label className="text-xs">Name</Label>
            <Input
              id="object-name"
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
                  placeholder="Key"
                  value={entry.key}
                  onChange={(e) => handleKeyChange(idx, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Select
                  value={entry.type}
                  onValueChange={(v) =>
                    handleTypeChange(idx, v as PropertyType)
                  }
                >
                  <SelectTrigger className="w-22 h-7 text-xs shrink-0">
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
                  placeholder="Value"
                  value={entry.value}
                  onChange={(e) => handleValueChange(idx, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
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
