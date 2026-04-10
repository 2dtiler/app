import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { NewMapDialogProps } from "@/types/dialogs";

export function NewMapDialog({
  open,
  onOpenChange,
  name,
  width,
  height,
  tileSize,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onCreate,
}: NewMapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-90">
        <DialogHeader>
          <DialogTitle>New Map</DialogTitle>
          <DialogDescription className="sr-only">
            Configure the new map properties
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-map-name" className="text-xs">
              Name
            </Label>
            <Input
              id="new-map-name"
              name="new-map-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="new-map-width" className="text-xs">
                Width (tiles)
              </Label>
              <Input
                id="new-map-width"
                name="new-map-width"
                type="number"
                min={1}
                max={256}
                value={width}
                onChange={(e) => onWidthChange(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="new-map-height" className="text-xs">
                Height (tiles)
              </Label>
              <Input
                id="new-map-height"
                name="new-map-height"
                type="number"
                min={1}
                max={256}
                value={height}
                onChange={(e) => onHeightChange(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Map pixel size: {width * tileSize} × {height * tileSize}px (tile
            size: {tileSize}px)
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onMouseDown={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onMouseDown={onCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}