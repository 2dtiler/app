import { ObjectPropertiesDialog } from "@/components/dialogs/ObjectPropertiesDialog";
import { useEditorStore } from "@/hooks/use-editor-store";
import { getTextObjectSettings } from "@/lib/text-objects";
import type { ObjectPropertiesDialogManagerProps } from "@/types";

export function ObjectPropertiesDialogManager({
  objectId,
  open,
  onOpenChange,
}: ObjectPropertiesDialogManagerProps) {
  const { state, setState } = useEditorStore();
  const object = objectId
    ? (state.project?.objects ?? []).find((candidate) => candidate.id === objectId)
    : null;

  if (!object) return null;

  return (
    <ObjectPropertiesDialog
      key={object.id}
      open={open}
      onOpenChange={onOpenChange}
      object={object}
      onSave={(updatedProps, updatedName) => {
        setState((draft) => {
          const target = (draft.project?.objects ?? []).find(
            (candidate) => candidate.id === object.id,
          );
          if (!target) return;
          target.properties = updatedProps as typeof target.properties;
          if (updatedName) target.name = updatedName;
          if (target.type === "text") {
            target.rotation = getTextObjectSettings({
              ...target,
              properties: updatedProps,
            }).rotation;
          }
        });
        onOpenChange(false);
      }}
    />
  );
}