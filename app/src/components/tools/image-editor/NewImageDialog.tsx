import { useState } from "react";
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
}

export function NewImageDialog({
  open,
  onClose,
  onCreate,
}: NewImageDialogProps) {
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);

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
          <DialogTitle>New Image</DialogTitle>
          <DialogDescription>
            Set the canvas dimensions for your new sprite.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="img-width" className="text-right">
              Width
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
              Height
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

          {/* Preset buttons */}
          <div className="flex gap-2 justify-end">
            {[8, 16, 32, 64, 128, 256].map((size) => (
              <Button
                key={size}
                variant="outline"
                size="xs"
                onClick={() => {
                  setWidth(size);
                  setHeight(size);
                }}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
