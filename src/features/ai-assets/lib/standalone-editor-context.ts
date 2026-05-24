import type { StandaloneAiImageEditorContext } from "@/features/ai-assets/types";

export interface PendingStandaloneAiImageEditorRequest {
  requestId: number;
  context: StandaloneAiImageEditorContext;
}

let activeContext: StandaloneAiImageEditorContext | null = null;
let activeRequestId = 0;

export function setStandaloneAiImageEditorContext(
  context: StandaloneAiImageEditorContext | null,
): void {
  activeContext = context;
  if (context) {
    activeRequestId += 1;
  }
}

export function getPendingStandaloneAiImageEditorRequest(): PendingStandaloneAiImageEditorRequest | null {
  if (!activeContext) return null;
  return {
    requestId: activeRequestId,
    context: activeContext,
  };
}

export function clearStandaloneAiImageEditorContext(requestId?: number): void {
  if (requestId !== undefined && requestId !== activeRequestId) {
    return;
  }
  activeContext = null;
}
