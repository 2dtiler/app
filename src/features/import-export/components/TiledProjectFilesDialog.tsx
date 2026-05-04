import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import type { TiledProjectFilesDialogProps } from "@/features/import-export/types";

export function TiledProjectFilesDialog({
  open,
  projectName,
  isSubmitting,
  onOpenChange,
  onSelectFolder,
}: TiledProjectFilesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-120" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Select Tiled project folder</DialogTitle>
          <DialogDescription>
            Choose the folder that contains the maps and linked resources for{" "}
            {projectName}.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter showCloseButton={!isSubmitting}>
          <Button
            type="button"
            onClick={() => void onSelectFolder()}
            disabled={isSubmitting}
          >
            <FolderOpen />
            {isSubmitting ? "Preparing import..." : "Choose folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
