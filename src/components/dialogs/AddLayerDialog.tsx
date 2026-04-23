import { useState } from "react";
import { Grid3X3, FolderOpen, Image, Shapes } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type {
  AddLayerDialogLayerType as LayerType,
  AddLayerDialogLayerTypeOption as LayerTypeOption,
  AddLayerDialogProps,
} from "@/types/app/dialogs";

const LAYER_TYPES: LayerTypeOption[] = [
  {
    type: "tile",
    label: "Tile Layer",
    icon: <Grid3X3 className="h-6 w-6" />,
    description:
      "A grid-based layer for placing tiles from your tilesets. The most common layer type for building maps.",
  },
  {
    type: "group",
    label: "Layer Group",
    icon: <FolderOpen className="h-6 w-6" />,
    description:
      "A container that groups multiple layers together for organization. Groups can be hidden, locked, and moved as a unit.",
  },
  {
    type: "image",
    label: "Image Layer",
    icon: <Image className="h-6 w-6" />,
    description:
      "A layer that displays a single image, such as a background or parallax element. Not bound to the tile grid.",
  },
  {
    type: "object",
    label: "Object Layer",
    icon: <Shapes className="h-6 w-6" />,
    description:
      "A layer for placing freeform objects like spawn points, collision zones, triggers, and other non-tile entities.",
  },
];

export function AddLayerDialog({
  open,
  onOpenChange,
  defaultName,
  onCreateLayer,
  onRequestImageLayer,
  allowedTypes,
}: AddLayerDialogProps) {
  const [step, setStep] = useState<"select" | "name">("select");
  const [selectedType, setSelectedType] = useState<LayerType>("tile");
  const [layerName, setLayerName] = useState(defaultName);

  function handleOpenChange(value: boolean) {
    if (!value) {
      // Reset state when closing
      setStep("select");
      setSelectedType("tile");
    }
    onOpenChange(value);
  }

  function handleSelectType(type: LayerType) {
    if (type === "image") {
      // Image layer: close dialog and let the parent handle file picking
      handleOpenChange(false);
      onRequestImageLayer?.();
      return;
    }
    setSelectedType(type);
    setLayerName(type === "group" ? "Group" : defaultName);
    setStep("name");
  }

  function handleBack() {
    setStep("select");
  }

  function handleCreate() {
    onCreateLayer(layerName.trim() || "New Layer", selectedType);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-115">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add Layer</DialogTitle>
              <DialogDescription>
                Choose the type of layer to add to your map.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2 py-2">
              {LAYER_TYPES.filter(
                (opt) => !allowedTypes || allowedTypes.includes(opt.type),
              ).map((opt) => (
                <button
                  key={opt.type}
                  onMouseDown={() => handleSelectType(opt.type)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer border-border hover:border-primary hover:bg-accent",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 shrink-0 rounded-md p-2 bg-primary/10 text-primary",
                    )}
                  >
                    {opt.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{opt.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                New{" "}
                {LAYER_TYPES.find((t) => t.type === selectedType)?.label ??
                  "Layer"}
              </DialogTitle>
              <DialogDescription>Give your layer a name.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label className="text-xs">Name</Label>
              <Input
                id="layer-name"
                value={layerName}
                onChange={(e) => setLayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onMouseDown={handleBack}>
                Back
              </Button>
              <Button size="sm" onMouseDown={handleCreate}>
                Create
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
