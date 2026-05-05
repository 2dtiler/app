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
import type { GodotProjectFilesDialogProps } from "@/features/import-export/types";

export function GodotProjectFilesDialog({
  open,
  projectName,
  isSubmitting,
  onOpenChange,
  onSelectFolder,
}: GodotProjectFilesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-120" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Select Godot project folder</DialogTitle>
          <DialogDescription>
            Choose the folder that contains the scenes, resources, and images
            for {projectName}.
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