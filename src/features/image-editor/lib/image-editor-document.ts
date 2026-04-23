import {
  destroyImageEditorStore,
  getImageEditorStore,
  initImageEditorStore,
  isImageEditorStoreReady,
  subscribeToImageEditorStoreInstance,
} from "@/store/image-editor-store";
import * as pixelHistory from "@/features/image-editor/lib/image-editor-history";
import {
  resetCropState,
  resetSelectionState,
} from "@/features/image-editor/lib/image-editor-tools";
import { getPendingImageLayerEditorRequest } from "@/features/image-editor/lib/image-layer-editor-context";
import { getPendingTileEditorRequest } from "@/features/map-editor/lib/tile-editor-context";
import type {
  ImageEditorGroupId,
  ImageEditorImageLayer,
  ImageEditorLayerGroup,
  ImageEditorLayerId,
  ImageEditorRasterLayer,
  ImageEditorState,
} from "@/features/image-editor/types";
import type {
  FrameOperation,
  PaletteLibrarySnapshot,
  ResizeOperation,
  ResizeSnapshot,
  UndoableActionType,
} from "@/features/image-editor/types/image-editor-hook";

export const moduleLayerFrameData: Map<string, ImageData> = new Map();

export const frameOpUndoStack: FrameOperation[] = [];
export const frameOpRedoStack: FrameOperation[] = [];

export const paletteUndoStack: PaletteLibrarySnapshot[] = [];
export const paletteRedoStack: PaletteLibrarySnapshot[] = [];

export const resizeUndoStack: ResizeOperation[] = [];
export const resizeRedoStack: ResizeOperation[] = [];

export const actionLog: UndoableActionType[] = [];
export const redoLog: UndoableActionType[] = [];

let savedDocumentFingerprint: string | null = null;

function hashPixelBuffer(data: Uint8ClampedArray): string {
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index]!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSaveFingerprint(state: ImageEditorState | null): string | null {
  if (!state) return null;

  const allLayerIds = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
    true,
  );

  const parts: string[] = [
    `size:${state.width}x${state.height}`,
    `fps:${state.fps}`,
    `frames:${state.frames.map((frame) => `${frame.id}:${frame.duration}`).join(",")}`,
    `layers:${state.layers
      .map((layer) => `${layer.id}:${layer.visible ? 1 : 0}`)
      .join(",")}`,
    `images:${state.imageLayers
      .map((layer) => `${layer.id}:${layer.visible ? 1 : 0}`)
      .join(",")}`,
    `groups:${state.layerGroups
      .map(
        (group) =>
          `${group.id}:${group.visible ? 1 : 0}:${group.childOrder.join(".")}`,
      )
      .join(",")}`,
    `order:${state.layerOrder.join(",")}`,
  ];

  for (const frame of state.frames) {
    for (const layerId of allLayerIds) {
      const imageData = moduleLayerFrameData.get(
        layerDataKey(frame.id, layerId),
      );
      parts.push(
        `${frame.id}:${layerId}:${imageData ? hashPixelBuffer(imageData.data) : "empty"}`,
      );
    }
  }

  return parts.join("|");
}

export async function canvasToPngBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function layerDataKey(frameId: string, layerId: string): string {
  return `${frameId}:${layerId}`;
}

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
}

export function getLeafLayerIds(
  order: readonly (ImageEditorLayerId | ImageEditorGroupId)[],
  layers: readonly ImageEditorRasterLayer[],
  imageLayers: readonly ImageEditorImageLayer[],
  groups: readonly ImageEditorLayerGroup[],
  ignoreVisibility = false,
  parentVisible = true,
): string[] {
  const result: string[] = [];

  for (const id of order) {
    const group = groups.find(
      (entry) => (entry.id as string) === (id as string),
    );
    if (group) {
      const childVisible = ignoreVisibility || (parentVisible && group.visible);
      result.push(
        ...getLeafLayerIds(
          group.childOrder,
          layers,
          imageLayers,
          groups,
          ignoreVisibility,
          childVisible,
        ),
      );
      continue;
    }

    const layer =
      layers.find((entry) => (entry.id as string) === (id as string)) ??
      imageLayers.find((entry) => (entry.id as string) === (id as string));
    if (layer && (ignoreVisibility || (parentVisible && layer.visible))) {
      result.push(id as string);
    }
  }

  return result;
}

export function getDocumentLayerDataKeys(state: ImageEditorState): string[] {
  const keys: string[] = [];
  const allLayerIds = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
    true,
  );

  for (const frame of state.frames) {
    for (const layerId of allLayerIds) {
      keys.push(layerDataKey(frame.id, layerId));
    }
  }

  return keys;
}

export function captureResizeSnapshot(state: ImageEditorState): ResizeSnapshot {
  const layerData = new Map<string, ImageData>();

  for (const key of getDocumentLayerDataKeys(state)) {
    const current = moduleLayerFrameData.get(key);
    layerData.set(
      key,
      current
        ? cloneImageData(current)
        : new ImageData(state.width, state.height),
    );
  }

  return {
    width: state.width,
    height: state.height,
    layerData,
  };
}

export function clearEditorSelectionState(): void {
  resetSelectionState();
  resetCropState();
}

export function restoreResizeSnapshot(snapshot: ResizeSnapshot): void {
  const store = getImageEditorStore();
  const currentState = store.getState();

  for (const key of getDocumentLayerDataKeys(currentState)) {
    if (!snapshot.layerData.has(key)) {
      moduleLayerFrameData.delete(key);
    }
  }

  for (const [key, imageData] of snapshot.layerData) {
    moduleLayerFrameData.set(key, cloneImageData(imageData));
  }

  clearEditorSelectionState();
  store.setState((draft) => {
    draft.width = snapshot.width;
    draft.height = snapshot.height;
    draft.selection = null;
    draft.pixelDataVersion = (draft.pixelDataVersion ?? 0) + 1;
  });
}

export function computeComposite(
  frameId: string,
  state: ImageEditorState,
): ImageData {
  const { width, height } = state;
  const visibleIds = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return new ImageData(width, height);
  }

  for (const layerId of visibleIds) {
    const data = moduleLayerFrameData.get(layerDataKey(frameId, layerId));
    if (!data) continue;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempContext = tempCanvas.getContext("2d");
    if (!tempContext) continue;
    tempContext.putImageData(data, 0, 0);
    context.drawImage(tempCanvas, 0, 0);
  }

  return context.getImageData(0, 0, width, height);
}

export function computeCompositeBelowLayer(
  frameId: string,
  activeLayerId: string,
  state: ImageEditorState,
): ImageData {
  const { width, height } = state;
  const allVisible = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
  );
  const activeIndex = allVisible.indexOf(activeLayerId);
  const belowIds = activeIndex > 0 ? allVisible.slice(0, activeIndex) : [];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return new ImageData(width, height);
  }

  for (const layerId of belowIds) {
    const data = moduleLayerFrameData.get(layerDataKey(frameId, layerId));
    if (!data) continue;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempContext = tempCanvas.getContext("2d");
    if (!tempContext) continue;
    tempContext.putImageData(data, 0, 0);
    context.drawImage(tempCanvas, 0, 0);
  }

  return context.getImageData(0, 0, width, height);
}

export function computeCompositeAboveLayer(
  frameId: string,
  activeLayerId: string,
  state: ImageEditorState,
): ImageData {
  const { width, height } = state;
  const allVisible = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
  );
  const activeIndex = allVisible.indexOf(activeLayerId);
  const aboveIds =
    activeIndex >= 0 && activeIndex < allVisible.length - 1
      ? allVisible.slice(activeIndex + 1)
      : [];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return new ImageData(width, height);
  }

  for (const layerId of aboveIds) {
    const data = moduleLayerFrameData.get(layerDataKey(frameId, layerId));
    if (!data) continue;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempContext = tempCanvas.getContext("2d");
    if (!tempContext) continue;
    tempContext.putImageData(data, 0, 0);
    context.drawImage(tempCanvas, 0, 0);
  }

  return context.getImageData(0, 0, width, height);
}

export function snapshotPaletteLibrary(
  state: ImageEditorState,
): PaletteLibrarySnapshot {
  return {
    palettes: state.palettes.map((palette) => ({
      ...palette,
      colors: palette.colors.map((color) => ({ ...color })),
    })),
    activePaletteId: state.activePaletteId,
  };
}

export function getActivePaletteIndex(state: ImageEditorState): number {
  const index = state.palettes.findIndex(
    (palette) => palette.id === state.activePaletteId,
  );
  return index >= 0 ? index : 0;
}

export function insertAfterInOrder(
  refId: string,
  newId: ImageEditorLayerId | ImageEditorGroupId,
  topOrder: (ImageEditorLayerId | ImageEditorGroupId)[],
  groups: ImageEditorLayerGroup[],
): void {
  const topIndex = (topOrder as string[]).indexOf(refId);
  if (topIndex !== -1) {
    topOrder.splice(topIndex + 1, 0, newId);
    return;
  }

  for (const group of groups) {
    const childIndex = (group.childOrder as string[]).indexOf(refId);
    if (childIndex !== -1) {
      group.childOrder.splice(childIndex + 1, 0, newId);
      return;
    }
  }

  topOrder.push(newId);
}

export function ensureStoreReady(): void {
  if (isImageEditorStoreReady()) return;

  const pendingTileRequest = getPendingTileEditorRequest();
  const pendingImageLayerRequest = getPendingImageLayerEditorRequest();
  const width = pendingTileRequest?.context.sw
    ? pendingTileRequest.context.sw
    : pendingImageLayerRequest?.context.width &&
        pendingImageLayerRequest.context.width > 0
      ? pendingImageLayerRequest.context.width
      : 16;
  const height = pendingTileRequest?.context.sh
    ? pendingTileRequest.context.sh
    : pendingImageLayerRequest?.context.height &&
        pendingImageLayerRequest.context.height > 0
      ? pendingImageLayerRequest.context.height
      : 16;

  initImageEditorStore(width, height);

  const store = getImageEditorStore();
  const state = store.getState();
  if (state.frames.length > 0 && state.layers.length > 0) {
    const key = layerDataKey(state.frames[0].id, state.layers[0].id);
    if (!moduleLayerFrameData.has(key)) {
      moduleLayerFrameData.set(key, new ImageData(width, height));
    }
  }

  if (savedDocumentFingerprint === null) {
    savedDocumentFingerprint = buildSaveFingerprint(state);
  }
}

export function markSavePoint(state: ImageEditorState | null): void {
  savedDocumentFingerprint = buildSaveFingerprint(state);
}

export function hasUnsavedImageChanges(
  state: ImageEditorState | null,
): boolean {
  const currentFingerprint = buildSaveFingerprint(state);
  if (!currentFingerprint) return false;
  return currentFingerprint !== savedDocumentFingerprint;
}

export function resetImageEditorDocumentState(): void {
  destroyImageEditorStore();
  pixelHistory.clearAllHistory();
  moduleLayerFrameData.clear();
  paletteUndoStack.length = 0;
  paletteRedoStack.length = 0;
  frameOpUndoStack.length = 0;
  frameOpRedoStack.length = 0;
  resizeUndoStack.length = 0;
  resizeRedoStack.length = 0;
  actionLog.length = 0;
  redoLog.length = 0;
  savedDocumentFingerprint = null;
}

export {
  getImageEditorStore,
  isImageEditorStoreReady,
  subscribeToImageEditorStoreInstance,
};
