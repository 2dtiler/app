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

interface ExportDialogProps {
  open: boolean;
  totalFrames: number;
  onClose: () => void;
  onExportSpriteSheet: (columns: number) => void;
}

export function ExportDialog({
  open,
  totalFrames,
  onClose,
  onExportSpriteSheet,
}: ExportDialogProps) {
  const [columns, setColumns] = useState(totalFrames);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Export Sprite Sheet</DialogTitle>
          <DialogDescription>
            Configure how frames are laid out in the sprite sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sheet-cols" className="text-right">
              Columns
            </Label>
            <Input
              id="sheet-cols"
              type="number"
              min={1}
              max={totalFrames}
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              className="col-span-3"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {totalFrames} frames → {columns} columns ×{" "}
            {Math.ceil(totalFrames / Math.max(1, columns))} rows
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onExportSpriteSheet(Math.max(1, columns));
              onClose();
            }}
          >
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
