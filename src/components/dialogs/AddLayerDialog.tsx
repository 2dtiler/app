import { useState } from "react";
import { Grid3X3, FolderOpen, Image, Shapes } from "lucide-react";
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
import { cn } from "@/lib/utils";

type LayerType = "tile" | "group" | "image" | "object";

interface LayerTypeOption {
  type: LayerType;
  label: string;
  icon: React.ReactNode;
  description: string;
  disabled: boolean;
}

const LAYER_TYPES: LayerTypeOption[] = [
  {
    type: "tile",
    label: "Tile Layer",
    icon: <Grid3X3 className="h-6 w-6" />,
    description:
      "A grid-based layer for placing tiles from your tilesets. The most common layer type for building maps.",
    disabled: false,
  },
  {
    type: "group",
    label: "Layer Group",
    icon: <FolderOpen className="h-6 w-6" />,
    description:
      "A container that groups multiple layers together for organization. Groups can be hidden, locked, and moved as a unit.",
    disabled: false,
  },
  {
    type: "image",
    label: "Image Layer",
    icon: <Image className="h-6 w-6" />,
    description:
      "A layer that displays a single image, such as a background or parallax element. Not bound to the tile grid.",
    disabled: false,
  },
  {
    type: "object",
    label: "Object Layer",
    icon: <Shapes className="h-6 w-6" />,
    description:
      "A layer for placing freeform objects like spawn points, collision zones, triggers, and other non-tile entities.",
    disabled: true,
  },
];

interface AddLayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreateLayer: (name: string, type: LayerType) => void;
  /** Called when the user selects "Image Layer" — parent handles file picking */
  onRequestImageLayer?: () => void;
}

export function AddLayerDialog({
  open,
  onOpenChange,
  defaultName,
  onCreateLayer,
  onRequestImageLayer,
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
              {LAYER_TYPES.map((opt) => (
                <button
                  key={opt.type}
                  disabled={opt.disabled}
                  onClick={() => handleSelectType(opt.type)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    opt.disabled
                      ? "cursor-not-allowed opacity-40 border-border"
                      : "cursor-pointer border-border hover:border-primary hover:bg-accent",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 shrink-0 rounded-md p-2",
                      opt.disabled
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {opt.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{opt.label}</span>
                      {opt.disabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          Coming soon
                        </span>
                      )}
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
                value={layerName}
                onChange={(e) => setLayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Back
              </Button>
              <Button size="sm" onClick={handleCreate}>
                Create
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
