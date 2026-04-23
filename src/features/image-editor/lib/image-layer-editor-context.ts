import type { ImageLayerEditorContext } from "@/features/image-editor/types/image-editor-context";

export interface PendingImageLayerEditorRequest {
  requestId: number;
  context: ImageLayerEditorContext;
}

let activeContext: ImageLayerEditorContext | null = null;
let activeRequestId = 0;

export function setImageLayerEditorContext(
  ctx: ImageLayerEditorContext | null,
): void {
  activeContext = ctx;
  if (ctx) {
    activeRequestId += 1;
  }
}

export function getImageLayerEditorContext(): ImageLayerEditorContext | null {
  return activeContext;
}

export function getPendingImageLayerEditorRequest(): PendingImageLayerEditorRequest | null {
  if (!activeContext) {
    return null;
  }

  return {
    requestId: activeRequestId,
    context: activeContext,
  };
}

export function clearImageLayerEditorContext(requestId?: number): void {
  if (requestId !== undefined && requestId !== activeRequestId) {
    return;
  }

  activeContext = null;
}
