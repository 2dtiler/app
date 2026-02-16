import { useState, useEffect } from "react";
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

interface NewImageDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number) => void;
  /** When provided, the dialog acts as a "resize" dialog pre-filled with current dimensions. */
  initialWidth?: number;
  initialHeight?: number;
}

export function NewImageDialog({
  open,
  onClose,
  onCreate,
  initialWidth,
  initialHeight,
}: NewImageDialogProps) {
  const [width, setWidth] = useState(initialWidth ?? 32);
  const [height, setHeight] = useState(initialHeight ?? 32);

  // Sync local state when the dialog opens with new initial values
  useEffect(() => {
    if (open) {
      setWidth(initialWidth ?? 32);
      setHeight(initialHeight ?? 32);
    }
  }, [open, initialWidth, initialHeight]);

  const handleCreate = () => {
    const w = Math.max(1, Math.min(1024, width));
    const h = Math.max(1, Math.min(1024, height));
    onCreate(w, h);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Image Dimensions</DialogTitle>
          <DialogDescription>
            Set the canvas dimensions for your image/sprite.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="img-width" className="text-right">
              Width (px)
            </Label>
            <Input
              id="img-width"
              type="number"
              min={1}
              max={1024}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="img-height" className="text-right">
              Height (px)
            </Label>
            <Input
              id="img-height"
              type="number"
              min={1}
              max={1024}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="col-span-3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Set Size</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
