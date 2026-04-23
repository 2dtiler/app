import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import type { AboutDialogProps } from "@/features/app-shell";

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-90">
        <DialogHeader>
          <DialogTitle className="text-primary">About 2D Tiler</DialogTitle>
          <DialogDescription className="sr-only">
            Information about the 2D Tiler application
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="text-xs tracking-widest uppercase text-primary font-medium">
            Version 0.1.2
          </p>
          <p>
            A tile map editor built with React for creating 2D game maps. Upload
            tileset images, paint maps with brushes, manage layers, and export
            your work.
          </p>
          <div className="border-t border-border pt-3 text-xs space-y-1">
            <p>
              <span className="text-foreground">Engine:</span> React 19
            </p>
            <p>
              <span className="text-foreground">Persistence:</span> IndexedDB
              (local-first)
            </p>
            <p>
              <span className="text-foreground">Format:</span> .2dp (MsgPack +
              zlib)
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
