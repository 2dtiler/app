import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import * as pixelHistory from "@/features/image-editor/lib/image-editor-history";
import {
  actionLog,
  frameOpRedoStack,
  frameOpUndoStack,
  getLeafLayerIds,
  layerDataKey,
  moduleLayerFrameData,
  paletteRedoStack,
  redoLog,
} from "@/features/image-editor/lib/image-editor-document";
import type { Frame, FrameId } from "@/features/image-editor/types";
import type { ImageEditorFrameActionsParams } from "@/features/image-editor/types/image-editor-hook-internals";
import type { FrameMoveDirection } from "@/features/image-editor/types/image-editor-hook-internals";

export function useImageEditorFrameActions({
  state,
  setState,
}: ImageEditorFrameActionsParams) {
  const addFrame = useCallback(() => {
    if (!state) return;

    const newId = uuidv4() as FrameId;
    const newFrame: Frame = {
      id: newId,
      name: `Frame ${state.frames.length + 1}`,
      duration: 100,
    };

    const allLayerIds = getLeafLayerIds(
      state.layerOrder,
      state.layers,
      state.imageLayers,
      state.layerGroups,
      true,
    );
    const savedLayerData = new Map<string, ImageData>();
    for (const layerId of allLayerIds) {
      const blank = new ImageData(state.width, state.height);
      moduleLayerFrameData.set(layerDataKey(newId, layerId), blank);
      savedLayerData.set(
        layerId,
        new ImageData(
          new Uint8ClampedArray(blank.data),
          blank.width,
          blank.height,
        ),
      );
    }

    frameOpUndoStack.push({
      type: "add",
      frameId: newId,
      frame: { ...newFrame },
      index: state.frames.length,
      layerData: savedLayerData,
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

    setState((draft) => {
      draft.frames.push(newFrame);
      draft.currentFrameIndex = draft.frames.length - 1;
    });
  }, [state, setState]);

  const duplicateFrame = useCallback(() => {
    if (!state) return;

    const sourceFrame = state.frames[state.currentFrameIndex];
    if (!sourceFrame) return;

    const newId = uuidv4() as FrameId;
    const newFrame: Frame = {
      id: newId,
      name: `${sourceFrame.name} copy`,
      duration: sourceFrame.duration,
    };

    const allLayerIds = getLeafLayerIds(
      state.layerOrder,
      state.layers,
      state.imageLayers,
      state.layerGroups,
      true,
    );
    const savedLayerData = new Map<string, ImageData>();
    for (const layerId of allLayerIds) {
      const sourceData = moduleLayerFrameData.get(
        layerDataKey(sourceFrame.id, layerId),
      );
      const copiedData = sourceData
        ? new ImageData(
            new Uint8ClampedArray(sourceData.data),
            sourceData.width,
            sourceData.height,
          )
        : new ImageData(state.width, state.height);
      moduleLayerFrameData.set(layerDataKey(newId, layerId), copiedData);
      savedLayerData.set(
        layerId,
        new ImageData(
          new Uint8ClampedArray(copiedData.data),
          copiedData.width,
          copiedData.height,
        ),
      );
    }

    const insertIndex = state.currentFrameIndex + 1;
    frameOpUndoStack.push({
      type: "duplicate",
      frameId: newId,
      frame: { ...newFrame },
      index: insertIndex,
      layerData: savedLayerData,
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

    setState((draft) => {
      draft.frames.splice(draft.currentFrameIndex + 1, 0, newFrame);
      draft.currentFrameIndex += 1;
    });
  }, [state, setState]);

  const deleteFrame = useCallback(() => {
    if (!state || state.frames.length <= 1) return;

    const frameToDelete = state.frames[state.currentFrameIndex];
    if (!frameToDelete) return;

    const allLayerIds = getLeafLayerIds(
      state.layerOrder,
      state.layers,
      state.imageLayers,
      state.layerGroups,
      true,
    );
    const savedLayerData = new Map<string, ImageData>();
    for (const layerId of allLayerIds) {
      const data = moduleLayerFrameData.get(
        layerDataKey(frameToDelete.id, layerId),
      );
      if (data) {
        savedLayerData.set(
          layerId,
          new ImageData(
            new Uint8ClampedArray(data.data),
            data.width,
            data.height,
          ),
        );
      } else {
        savedLayerData.set(layerId, new ImageData(state.width, state.height));
      }
    }

    frameOpUndoStack.push({
      type: "delete",
      frameId: frameToDelete.id,
      frame: { ...frameToDelete },
      index: state.currentFrameIndex,
      layerData: savedLayerData,
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

    for (const layerId of allLayerIds) {
      moduleLayerFrameData.delete(layerDataKey(frameToDelete.id, layerId));
    }
    pixelHistory.clearAllHistoryForFrame(frameToDelete.id);

    setState((draft) => {
      draft.frames.splice(draft.currentFrameIndex, 1);
      if (draft.currentFrameIndex >= draft.frames.length) {
        draft.currentFrameIndex = draft.frames.length - 1;
      }
    });
  }, [state, setState]);

  const moveFrame = useCallback(
    (direction: FrameMoveDirection) => {
      if (!state) return;

      const { currentFrameIndex, frames } = state;
      const targetIndex =
        direction === "left" ? currentFrameIndex - 1 : currentFrameIndex + 1;
      if (targetIndex < 0 || targetIndex >= frames.length) return;

      setState((draft) => {
        const temp = draft.frames[currentFrameIndex];
        draft.frames[currentFrameIndex] = draft.frames[targetIndex];
        draft.frames[targetIndex] = temp;
        draft.currentFrameIndex = targetIndex;
      });
    },
    [state, setState],
  );

  const setCurrentFrame = useCallback(
    (index: number) => {
      setState((draft) => {
        draft.currentFrameIndex = Math.max(
          0,
          Math.min(index, draft.frames.length - 1),
        );
      });
    },
    [setState],
  );

  const setFrameDuration = useCallback(
    (frameIndex: number, duration: number) => {
      setState((draft) => {
        if (draft.frames[frameIndex]) {
          draft.frames[frameIndex].duration = duration;
        }
      });
    },
    [setState],
  );

  const undoFrameOp = useCallback((): boolean => {
    if (frameOpUndoStack.length === 0) return false;

    const operation = frameOpUndoStack.pop();
    if (!operation) return false;

    switch (operation.type) {
      case "add":
      case "duplicate": {
        const savedLayerData = new Map<string, ImageData>();
        for (const [layerId, imageData] of operation.layerData) {
          const current = moduleLayerFrameData.get(
            layerDataKey(operation.frameId, layerId),
          );
          savedLayerData.set(
            layerId,
            current
              ? new ImageData(
                  new Uint8ClampedArray(current.data),
                  current.width,
                  current.height,
                )
              : imageData,
          );
          moduleLayerFrameData.delete(layerDataKey(operation.frameId, layerId));
        }
        frameOpRedoStack.push({ ...operation, layerData: savedLayerData });
        pixelHistory.clearAllHistoryForFrame(operation.frameId);
        setState((draft) => {
          const index = draft.frames.findIndex(
            (frame) => frame.id === operation.frameId,
          );
          if (index >= 0) {
            draft.frames.splice(index, 1);
          }
          draft.currentFrameIndex = Math.min(
            operation.prevFrameIndex,
            draft.frames.length - 1,
          );
        });
        return true;
      }
      case "delete": {
        for (const [layerId, imageData] of operation.layerData) {
          moduleLayerFrameData.set(
            layerDataKey(operation.frameId, layerId),
            new ImageData(
              new Uint8ClampedArray(imageData.data),
              imageData.width,
              imageData.height,
            ),
          );
        }
        frameOpRedoStack.push(operation);
        setState((draft) => {
          const index = Math.min(operation.index, draft.frames.length);
          draft.frames.splice(index, 0, operation.frame);
          draft.currentFrameIndex = index;
        });
        return true;
      }
    }
  }, [setState]);

  const redoFrameOp = useCallback((): boolean => {
    if (frameOpRedoStack.length === 0) return false;

    const operation = frameOpRedoStack.pop();
    if (!operation) return false;

    switch (operation.type) {
      case "add":
      case "duplicate": {
        for (const [layerId, imageData] of operation.layerData) {
          moduleLayerFrameData.set(
            layerDataKey(operation.frameId, layerId),
            new ImageData(
              new Uint8ClampedArray(imageData.data),
              imageData.width,
              imageData.height,
            ),
          );
        }
        frameOpUndoStack.push(operation);
        setState((draft) => {
          const index = Math.min(operation.index, draft.frames.length);
          draft.frames.splice(index, 0, operation.frame);
          draft.currentFrameIndex = index;
        });
        return true;
      }
      case "delete": {
        const savedLayerData = new Map<string, ImageData>();
        for (const [layerId, imageData] of operation.layerData) {
          const current = moduleLayerFrameData.get(
            layerDataKey(operation.frameId, layerId),
          );
          savedLayerData.set(
            layerId,
            current
              ? new ImageData(
                  new Uint8ClampedArray(current.data),
                  current.width,
                  current.height,
                )
              : imageData,
          );
          moduleLayerFrameData.delete(layerDataKey(operation.frameId, layerId));
        }
        frameOpUndoStack.push({ ...operation, layerData: savedLayerData });
        pixelHistory.clearAllHistoryForFrame(operation.frameId);
        setState((draft) => {
          const index = draft.frames.findIndex(
            (frame) => frame.id === operation.frameId,
          );
          if (index >= 0) {
            draft.frames.splice(index, 1);
            if (draft.currentFrameIndex >= draft.frames.length) {
              draft.currentFrameIndex = draft.frames.length - 1;
            }
          }
        });
        return true;
      }
    }
  }, [setState]);

  return {
    addFrame,
    duplicateFrame,
    deleteFrame,
    moveFrame,
    setCurrentFrame,
    setFrameDuration,
    undoFrameOp,
    redoFrameOp,
  };
}
