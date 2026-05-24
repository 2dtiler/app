import type { AiGeneratedImageRecord } from "@/types/integrations/ai-assets";
import type { ImageState } from "@/types/integrations/ai-assets";

export interface StandaloneAiImageEditorContext {
  id: string;
  data: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
  name: string;
}

export interface AiImageActionHandlers {
  onDownload: (record: AiGeneratedImageRecord) => void;
  onToggleSaved: (record: AiGeneratedImageRecord) => void;
  onAddToTileset: (record: AiGeneratedImageRecord) => void;
  onOpenInEditor: (record: AiGeneratedImageRecord) => void;
  onDelete: (record: AiGeneratedImageRecord) => void;
}

export interface GeneratedImageCellProps {
  state?: ImageState;
  index: number;
  record?: AiGeneratedImageRecord | null;
  url?: string | null;
  actions?: AiImageActionHandlers;
}

export interface AiRecordsGridProps {
  records: AiGeneratedImageRecord[];
  urls: Record<string, string>;
  actions: AiImageActionHandlers;
  emptyLabel: string;
}
