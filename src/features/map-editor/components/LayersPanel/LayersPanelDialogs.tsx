import { AddLayerDialog } from "@/features/map-editor/dialogs/AddLayerDialog";
import type { LayersPanelDialogsProps } from "@/features/map-editor/types/layers-panel";
import { DeleteLayerDialog } from "./DeleteLayerDialog";
import { DualGridLayerDialog } from "./DualGridLayerDialog";

export function LayersPanelDialogs({
  addLayerOpen,
  defaultLayerName,
  deleteTarget,
  dualGridTarget,
  imageInputRef,
  onAddLayerOpenChange,
  onConfirmDualGridToggle,
  onCreateLayer,
  onDelete,
  onDeleteOpenChange,
  onDualGridOpenChange,
  onImageFileSelected,
  onRequestImageLayer,
}: LayersPanelDialogsProps) {
  return (
    <>
      <AddLayerDialog
        open={addLayerOpen}
        onOpenChange={onAddLayerOpenChange}
        defaultName={defaultLayerName}
        onCreateLayer={onCreateLayer}
        onRequestImageLayer={onRequestImageLayer}
      />
      <input
        ref={imageInputRef}
        id="image-layer-file-input"
        name="image-layer-file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageFileSelected}
      />
      <DeleteLayerDialog
        deleteTarget={deleteTarget}
        onOpenChange={onDeleteOpenChange}
        onDelete={onDelete}
      />
      <DualGridLayerDialog
        target={dualGridTarget}
        onOpenChange={onDualGridOpenChange}
        onConfirm={onConfirmDualGridToggle}
      />
    </>
  );
}
