import { useCallback, useMemo, useState } from "react";
import {
  buildTextObjectPatch,
  getTextObjectSettings,
  isTextObject,
} from "@/lib/text-objects";
import type { MapObject, ObjectId, TextObjectEditingState } from "@/types";

type SetEditorState = (
  updater: (draft: { project: { objects: MapObject[] } | null }) => void,
) => void;

export function useTextObjectEditing(
  objects: MapObject[],
  setState: SetEditorState,
) {
  const [editing, setEditing] = useState<TextObjectEditingState | null>(null);

  const editingObject = useMemo(
    () => objects.find((object) => object.id === editing?.objectId) ?? null,
    [editing?.objectId, objects],
  );

  const beginEditing = useCallback(
    (objectId: ObjectId | string) => {
      const object = objects.find((candidate) => candidate.id === objectId);
      if (!object || !isTextObject(object)) return false;
      setEditing({
        objectId: object.id,
        text: getTextObjectSettings(object).text,
      });
      return true;
    },
    [objects],
  );

  const startEditing = useCallback((objectId: ObjectId | string, text = "") => {
    setEditing({ objectId: String(objectId), text });
  }, []);

  const updateText = useCallback((text: string) => {
    setEditing((current) => (current ? { ...current, text } : current));
  }, []);

  const cancelEditing = useCallback(() => {
    setEditing(null);
  }, []);

  const commitEditing = useCallback(() => {
    if (!editing) return;
    const object = objects.find(
      (candidate) => candidate.id === editing.objectId,
    );
    if (!object || !isTextObject(object)) {
      setEditing(null);
      return;
    }

    const currentSettings = getTextObjectSettings(object);
    const patch = buildTextObjectPatch(object, {
      text: editing.text,
      size: String(currentSettings.size),
      rotation: String(currentSettings.rotation),
      font: currentSettings.font,
      wordWrap: currentSettings.wordWrap,
      color: currentSettings.color,
    });

    setState((draft) => {
      const target = (draft.project?.objects ?? []).find(
        (candidate) => candidate.id === editing.objectId,
      );
      if (!target) return;
      target.properties = patch.properties ?? target.properties;
      target.rotation = patch.rotation ?? target.rotation;
    });
    setEditing(null);
  }, [editing, objects, setState]);

  return {
    editing,
    editingObject,
    beginEditing,
    startEditing,
    updateText,
    cancelEditing,
    commitEditing,
    isEditing: editing !== null,
  };
}
