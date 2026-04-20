import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import * as pixelHistory from "@/lib/image-editor-history";
import {
  insertAfterInOrder,
  layerDataKey,
  moduleLayerFrameData,
} from "@/lib/image-editor-document";
import {
  getImageEditorStore,
  isImageEditorStoreReady,
} from "@/lib/image-editor-store";
import type {
  ImageEditorGroupId,
  ImageEditorImageLayer,
  ImageEditorLayerGroup,
  ImageEditorLayerId,
  ImageEditorRasterLayer,
} from "@/types/image-editor";
import type {
  ImageEditorLayerActionsParams,
  LayerDropPosition,
  LayerMoveDirection,
} from "@/types/image-editor-hook-internals";

export function useImageEditorLayerActions({
  state,
  setState,
}: ImageEditorLayerActionsParams) {
  const addRasterLayer = useCallback(
    (name?: string) => {
      if (!state) return;

      const newId = uuidv4() as ImageEditorLayerId;
      const layerCount = state.layers.length + state.imageLayers.length;
      const layerName = name ?? `Layer ${layerCount + 1}`;

      for (const frame of state.frames) {
        moduleLayerFrameData.set(
          layerDataKey(frame.id, newId),
          new ImageData(state.width, state.height),
        );
      }

      setState((draft) => {
        const newLayer: ImageEditorRasterLayer = {
          id: newId,
          name: layerName,
          visible: true,
          locked: false,
          type: "tile",
        };
        draft.layers.push(newLayer);
        if (draft.activeLayerId) {
          insertAfterInOrder(
            draft.activeLayerId as string,
            newId,
            draft.layerOrder,
            draft.layerGroups,
          );
        } else {
          draft.layerOrder.push(newId);
        }
        draft.activeLayerId = newId;
      });
    },
    [state, setState],
  );

  const addImageEditorImageLayer = useCallback(
    (name?: string) => {
      if (!state) return;

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";

      fileInput.onchange = () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
          URL.revokeObjectURL(url);
          if (!isImageEditorStoreReady()) return;

          const currentState = getImageEditorStore().getState();
          const canvas = document.createElement("canvas");
          canvas.width = currentState.width;
          canvas.height = currentState.height;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.imageSmoothingEnabled = false;
          context.drawImage(
            image,
            0,
            0,
            currentState.width,
            currentState.height,
          );
          const imageData = context.getImageData(
            0,
            0,
            currentState.width,
            currentState.height,
          );

          const newId = uuidv4() as ImageEditorLayerId;
          const baseName =
            name ?? file.name.replace(/\.[^/.]+$/, "") ?? "Image";

          for (const frame of currentState.frames) {
            moduleLayerFrameData.set(
              layerDataKey(frame.id, newId),
              new ImageData(
                new Uint8ClampedArray(imageData.data),
                imageData.width,
                imageData.height,
              ),
            );
          }

          getImageEditorStore().setState((draft) => {
            const newLayer: ImageEditorImageLayer = {
              id: newId,
              name: baseName,
              visible: true,
              locked: false,
              type: "image",
            };
            draft.imageLayers.push(newLayer);
            if (draft.activeLayerId) {
              insertAfterInOrder(
                draft.activeLayerId as string,
                newId,
                draft.layerOrder,
                draft.layerGroups,
              );
            } else {
              draft.layerOrder.push(newId);
            }
            draft.activeLayerId = newId;
          });
        };

        image.onerror = () => {
          URL.revokeObjectURL(url);
        };

        image.src = url;
      };

      fileInput.click();
    },
    [state],
  );

  const addImageEditorLayerGroup = useCallback(
    (name?: string) => {
      if (!state) return;

      const newId = uuidv4() as ImageEditorGroupId;
      setState((draft) => {
        const newGroup: ImageEditorLayerGroup = {
          id: newId,
          name: name ?? "Group",
          visible: true,
          locked: false,
          expanded: true,
          childOrder: [],
        };
        draft.layerGroups.push(newGroup);
        draft.layerOrder.push(newId);
      });
    },
    [state, setState],
  );

  const deleteImageEditorLayer = useCallback(
    (id: string) => {
      if (!state) return;

      for (const frame of state.frames) {
        moduleLayerFrameData.delete(layerDataKey(frame.id, id));
      }
      pixelHistory.clearAllHistoryForFrame(id);

      setState((draft) => {
        draft.layerOrder = draft.layerOrder.filter(
          (entry) => (entry as string) !== id,
        ) as typeof draft.layerOrder;
        for (const group of draft.layerGroups) {
          group.childOrder = group.childOrder.filter(
            (entry) => (entry as string) !== id,
          ) as typeof group.childOrder;
        }
        draft.layers = draft.layers.filter(
          (layer) => (layer.id as string) !== id,
        );
        draft.imageLayers = draft.imageLayers.filter(
          (layer) => (layer.id as string) !== id,
        );
        if ((draft.activeLayerId as string) === id) {
          const remaining = draft.layerOrder;
          draft.activeLayerId =
            remaining.length > 0
              ? (remaining[remaining.length - 1] as ImageEditorLayerId)
              : null;
        }
      });
    },
    [state, setState],
  );

  const deleteImageEditorGroup = useCallback(
    (groupId: string) => {
      if (!state) return;

      setState((draft) => {
        const group = draft.layerGroups.find(
          (entry) => (entry.id as string) === groupId,
        );
        if (!group) return;

        function collectDescendants(
          order: (ImageEditorLayerId | ImageEditorGroupId)[],
        ): { layerIds: string[]; groupIds: string[] } {
          const layerIds: string[] = [];
          const groupIds: string[] = [];
          for (const id of order) {
            const nestedGroup = draft.layerGroups.find(
              (entry) => (entry.id as string) === (id as string),
            );
            if (nestedGroup) {
              groupIds.push(nestedGroup.id as string);
              const child = collectDescendants(nestedGroup.childOrder);
              layerIds.push(...child.layerIds);
              groupIds.push(...child.groupIds);
            } else {
              layerIds.push(id as string);
            }
          }
          return { layerIds, groupIds };
        }

        const { layerIds, groupIds } = collectDescendants(group.childOrder);
        const allGroupIds = [groupId, ...groupIds];

        draft.layers = draft.layers.filter(
          (layer) => !layerIds.includes(layer.id as string),
        );
        draft.imageLayers = draft.imageLayers.filter(
          (layer) => !layerIds.includes(layer.id as string),
        );
        draft.layerGroups = draft.layerGroups.filter(
          (entry) => !allGroupIds.includes(entry.id as string),
        );
        draft.layerOrder = draft.layerOrder.filter(
          (entry) => !allGroupIds.includes(entry as string),
        ) as typeof draft.layerOrder;
        for (const entry of draft.layerGroups) {
          entry.childOrder = entry.childOrder.filter(
            (childId) => !allGroupIds.includes(childId as string),
          ) as typeof entry.childOrder;
        }

        if (
          draft.activeLayerId &&
          layerIds.includes(draft.activeLayerId as string)
        ) {
          const remaining = draft.layerOrder;
          draft.activeLayerId =
            remaining.length > 0
              ? (remaining[remaining.length - 1] as ImageEditorLayerId)
              : null;
        }
      });
    },
    [state, setState],
  );

  const renameImageEditorLayer = useCallback(
    (id: string, name: string) => {
      if (!state || !name.trim()) return;

      setState((draft) => {
        const layer = draft.layers.find((entry) => (entry.id as string) === id);
        if (layer) {
          layer.name = name;
          return;
        }

        const imageLayer = draft.imageLayers.find(
          (entry) => (entry.id as string) === id,
        );
        if (imageLayer) {
          imageLayer.name = name;
          return;
        }

        const group = draft.layerGroups.find(
          (entry) => (entry.id as string) === id,
        );
        if (group) {
          group.name = name;
        }
      });
    },
    [state, setState],
  );

  const toggleImageEditorLayerVisible = useCallback(
    (id: string, isGroup: boolean) => {
      if (!state) return;

      setState((draft) => {
        if (isGroup) {
          const group = draft.layerGroups.find(
            (entry) => (entry.id as string) === id,
          );
          if (group) {
            group.visible = !group.visible;
          }
          return;
        }

        const layer = draft.layers.find((entry) => (entry.id as string) === id);
        if (layer) {
          layer.visible = !layer.visible;
          return;
        }

        const imageLayer = draft.imageLayers.find(
          (entry) => (entry.id as string) === id,
        );
        if (imageLayer) {
          imageLayer.visible = !imageLayer.visible;
        }
      });
    },
    [state, setState],
  );

  const toggleImageEditorLayerLocked = useCallback(
    (id: string, isGroup: boolean) => {
      if (!state) return;

      setState((draft) => {
        if (isGroup) {
          const group = draft.layerGroups.find(
            (entry) => (entry.id as string) === id,
          );
          if (group) {
            group.locked = !group.locked;
          }
          return;
        }

        const layer = draft.layers.find((entry) => (entry.id as string) === id);
        if (layer) {
          layer.locked = !layer.locked;
          return;
        }

        const imageLayer = draft.imageLayers.find(
          (entry) => (entry.id as string) === id,
        );
        if (imageLayer) {
          imageLayer.locked = !imageLayer.locked;
        }
      });
    },
    [state, setState],
  );

  const setActiveImageEditorLayer = useCallback(
    (id: string) => {
      if (!state) return;
      setState((draft) => {
        draft.activeLayerId = id as ImageEditorLayerId;
      });
    },
    [state, setState],
  );

  const toggleImageEditorGroupExpanded = useCallback(
    (id: string) => {
      if (!state) return;
      setState((draft) => {
        const group = draft.layerGroups.find(
          (entry) => (entry.id as string) === id,
        );
        if (group) {
          group.expanded = !group.expanded;
        }
      });
    },
    [state, setState],
  );

  const moveImageEditorLayerItem = useCallback(
    (
      id: string,
      direction: LayerMoveDirection,
      parentGroupId: string | null,
    ) => {
      if (!state) return;

      setState((draft) => {
        let order: (ImageEditorLayerId | ImageEditorGroupId)[];
        if (parentGroupId) {
          const group = draft.layerGroups.find(
            (entry) => (entry.id as string) === parentGroupId,
          );
          if (!group) return;
          order = group.childOrder;
        } else {
          order = draft.layerOrder;
        }

        const index = (order as string[]).indexOf(id);
        if (index === -1) return;
        const targetIndex = direction === "up" ? index + 1 : index - 1;
        if (targetIndex < 0 || targetIndex >= order.length) return;

        const temp = order[index];
        order[index] = order[targetIndex];
        order[targetIndex] = temp;
      });
    },
    [state, setState],
  );

  const duplicateImageEditorLayer = useCallback(
    (id: string) => {
      if (!state) return;

      const newId = uuidv4() as ImageEditorLayerId;
      for (const frame of state.frames) {
        const sourceData = moduleLayerFrameData.get(layerDataKey(frame.id, id));
        moduleLayerFrameData.set(
          layerDataKey(frame.id, newId),
          sourceData
            ? new ImageData(
                new Uint8ClampedArray(sourceData.data),
                sourceData.width,
                sourceData.height,
              )
            : new ImageData(state.width, state.height),
        );
      }

      setState((draft) => {
        const layer = draft.layers.find((entry) => (entry.id as string) === id);
        if (layer) {
          const copy: ImageEditorRasterLayer = {
            ...layer,
            id: newId,
            name: `${layer.name} copy`,
          };
          draft.layers.push(copy);
          insertAfterInOrder(id, newId, draft.layerOrder, draft.layerGroups);
          draft.activeLayerId = newId;
          return;
        }

        const imageLayer = draft.imageLayers.find(
          (entry) => (entry.id as string) === id,
        );
        if (imageLayer) {
          const copy: ImageEditorImageLayer = {
            ...imageLayer,
            id: newId,
            name: `${imageLayer.name} copy`,
          };
          draft.imageLayers.push(copy);
          insertAfterInOrder(id, newId, draft.layerOrder, draft.layerGroups);
          draft.activeLayerId = newId;
        }
      });
    },
    [state, setState],
  );

  const duplicateImageEditorGroup = useCallback(
    (id: string) => {
      if (!state) return;

      const newGroupId = uuidv4() as ImageEditorGroupId;
      setState((draft) => {
        const sourceGroup = draft.layerGroups.find(
          (entry) => (entry.id as string) === id,
        );
        if (!sourceGroup) return;

        const copy: ImageEditorLayerGroup = {
          ...sourceGroup,
          id: newGroupId,
          name: `${sourceGroup.name} copy`,
          childOrder: [...sourceGroup.childOrder],
        };
        draft.layerGroups.push(copy);
        insertAfterInOrder(id, newGroupId, draft.layerOrder, draft.layerGroups);
      });
    },
    [state, setState],
  );

  const moveImageEditorLayerIntoOrder = useCallback(
    (dragId: string, targetId: string, position: LayerDropPosition) => {
      if (!state) return;

      setState((draft) => {
        const removeFromOrder = (
          order: (ImageEditorLayerId | ImageEditorGroupId)[],
        ) => {
          const index = (order as string[]).indexOf(dragId);
          if (index !== -1) {
            order.splice(index, 1);
          }
        };

        removeFromOrder(draft.layerOrder);
        for (const group of draft.layerGroups) {
          removeFromOrder(group.childOrder);
        }

        if (position === "inside") {
          const targetGroup = draft.layerGroups.find(
            (entry) => (entry.id as string) === targetId,
          );
          if (targetGroup) {
            targetGroup.childOrder.push(
              dragId as ImageEditorLayerId | ImageEditorGroupId,
            );
            targetGroup.expanded = true;
          }
          return;
        }

        let targetOrder: (ImageEditorLayerId | ImageEditorGroupId)[] | null =
          null;
        if ((draft.layerOrder as string[]).includes(targetId)) {
          targetOrder = draft.layerOrder;
        } else {
          for (const group of draft.layerGroups) {
            if ((group.childOrder as string[]).includes(targetId)) {
              targetOrder = group.childOrder;
              break;
            }
          }
        }

        if (targetOrder) {
          const targetIndex = (targetOrder as string[]).indexOf(targetId);
          if (targetIndex !== -1) {
            const insertIndex =
              position === "above" ? targetIndex + 1 : targetIndex;
            targetOrder.splice(
              insertIndex,
              0,
              dragId as ImageEditorLayerId | ImageEditorGroupId,
            );
          }
        }
      });
    },
    [state, setState],
  );

  return {
    addRasterLayer,
    addImageEditorImageLayer,
    addImageEditorLayerGroup,
    deleteImageEditorLayer,
    deleteImageEditorGroup,
    renameImageEditorLayer,
    toggleImageEditorLayerVisible,
    toggleImageEditorLayerLocked,
    setActiveImageEditorLayer,
    toggleImageEditorGroupExpanded,
    moveImageEditorLayerItem,
    duplicateImageEditorLayer,
    duplicateImageEditorGroup,
    moveImageEditorLayerIntoOrder,
  };
}
