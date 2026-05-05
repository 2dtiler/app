import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import type { TilesetDeleteDialogProps } from "@/features/map-editor/types/tileset-panel";

export function TilesetDeleteDialog({
  deleteTarget,
  onOpenChange,
  onConfirm,
}: TilesetDeleteDialogProps) {
  return (
    <AlertDialog open={!!deleteTarget} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {deleteTarget?.type === "group" ? "group" : "tileset"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete "{deleteTarget?.name}"
            {deleteTarget?.type === "group" && " and all tilesets in it"}. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
