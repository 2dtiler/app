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
import type { DualGridLayerDialogProps } from "@/features/map-editor/types/layers-panel";

export function DualGridLayerDialog({
  target,
  onOpenChange,
  onConfirm,
}: DualGridLayerDialogProps) {
  const enabling = target?.enabling ?? false;

  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {enabling ? "Enable dual grid?" : "Disable dual grid?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {enabling
              ? target?.hasTiles
                ? `Switching "${target.name}" to dual grid will clear existing tiles on this layer. Paint with a Dual Grid (15) autotile terrain afterward.`
                : `Layer "${target?.name ?? ""}" will use dual-grid painting. Display tiles sit on vertices and follow logical terrain.`
              : `Switching "${target?.name ?? ""}" back to a standard tile layer will clear dual-grid terrain and derived display tiles.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onMouseDown={onConfirm}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
