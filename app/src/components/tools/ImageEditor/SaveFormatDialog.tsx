import { useState } from "react";
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
  SaveFormat,
  SaveFormatDialogProps,
} from "@/types/image-editor-ui";

const FORMAT_OPTIONS: { id: SaveFormat; label: string; description: string }[] =
  [
    {
      id: "png",
      label: "PNG Image",
      description: "Export the current frame as a PNG file",
    },
    {
      id: "gif",
      label: "Animated GIF",
      description: "Export all frames as an animated GIF",
    },
    {
      id: "spritesheet",
      label: "Sprite Sheet",
      description: "Export all frames laid out in a grid PNG",
    },
  ];

export function SaveFormatDialog({
  open,
  totalFrames,
  onClose,
  onSavePng,
  onSaveGif,
  onSaveSpriteSheet,
}: SaveFormatDialogProps) {
  const [format, setFormat] = useState<SaveFormat>("png");
  const [columns, setColumns] = useState(totalFrames);

  function handleSave() {
    if (format === "png") {
      onSavePng();
      onClose();
    } else if (format === "gif") {
      onSaveGif();
      onClose();
    } else {
      onSaveSpriteSheet(Math.max(1, columns));
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save Image</DialogTitle>
          <DialogDescription>
            Choose a format to export your image.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 text-left transition-colors w-full",
                format === f.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
              onClick={() => setFormat(f.id)}
            >
              <div
                className={cn(
                  "mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  format === f.id
                    ? "border-primary"
                    : "border-muted-foreground",
                )}
              >
                {format === f.id && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
            </button>
          ))}

          {format === "spritesheet" && (
            <div className="grid gap-3 pt-2 pl-1">
              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="save-fmt-cols" className="text-right text-sm">
                  Columns
                </Label>
                <Input
                  id="save-fmt-cols"
                  type="number"
                  min={1}
                  max={totalFrames}
                  value={columns}
                  onChange={(e) => setColumns(Number(e.target.value))}
                  className="col-span-3"
                />
              </div>
              <p className="text-xs text-muted-foreground text-right pr-1">
                {totalFrames} frames → {columns} columns ×{" "}
                {Math.ceil(totalFrames / Math.max(1, columns))} rows
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
