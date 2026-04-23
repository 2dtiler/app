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
import type { DeleteLayerDialogProps } from "@/types/editor/layers-panel";

export function DeleteLayerDialog({
  deleteTarget,
  onOpenChange,
  onDelete,
}: DeleteLayerDialogProps) {
  return (
    <AlertDialog open={!!deleteTarget} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {deleteTarget?.isGroup ? "layer group" : "layer"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete &quot;{deleteTarget?.name}&quot;
            {deleteTarget?.isGroup && " and all layers inside it"}. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onMouseDown={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
