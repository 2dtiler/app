import { useState, useEffect } from "react";
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
import type { MapObject } from "@/types";

interface ObjectPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object: MapObject;
  onSave: (properties: Record<string, string>, name?: string) => void;
}

export function ObjectPropertiesDialog({
  open,
  onOpenChange,
  object,
  onSave,
}: ObjectPropertiesDialogProps) {
  const [name, setName] = useState(object.name);
  const [entries, setEntries] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (open) {
      setName(object.name);
      const props = Object.entries(object.properties ?? {}).map(
        ([key, value]) => ({ key, value }),
      );
      setEntries(props);
    }
  }, [open, object]);

  function handleAddProperty() {
    setEntries((prev) => [...prev, { key: "", value: "" }]);
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

  function handleSave() {
    const properties: Record<string, string> = {};
    for (const { key, value } of entries) {
      const trimmedKey = key.trim();
      if (trimmedKey) {
        properties[trimmedKey] = value;
      }
    }
    onSave(properties, name.trim() || object.name);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-110">
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
                onClick={handleAddProperty}
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
                  placeholder="Key"
                  value={entry.key}
                  onChange={(e) => handleKeyChange(idx, e.target.value)}
                  className="flex-1 h-7 text-xs"
                />
                <Input
                  placeholder="Value"
                  value={entry.value}
                  onChange={(e) => handleValueChange(idx, e.target.value)}
                  className="flex-1 h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => handleRemoveProperty(idx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
