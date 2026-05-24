import {
  Download,
  ImagePlus,
  Loader2,
  Pencil,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { GeneratedImageCellProps } from "@/features/ai-assets/types";

export function ImageCell({
  state,
  index,
  record,
  url,
  actions,
}: GeneratedImageCellProps) {
  const resolvedState = state ?? (url ? { status: "done" as const, url } : { status: "idle" as const });
  const imageUrl = resolvedState.status === "done" ? resolvedState.url : url;

  return (
    <div className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
      {resolvedState.status === "idle" && (
        <span className="select-none text-xs text-muted-foreground">#{index + 1}</span>
      )}

      {resolvedState.status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Generating...</span>
        </div>
      )}

      {resolvedState.status === "done" && imageUrl && (
        <img
          src={imageUrl}
          alt={`Generated image ${index + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {resolvedState.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <X className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-xs leading-snug text-destructive">{resolvedState.message}</p>
        </div>
      )}

      {record && actions && imageUrl && (
        <div className="absolute inset-x-1 bottom-1 flex flex-wrap justify-center gap-1 rounded-md bg-background/90 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Download"
            aria-label="Download generated image"
            onClick={() => actions.onDownload(record)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={record.savedAt ? "Remove from gallery" : "Save to gallery"}
            aria-label={record.savedAt ? "Remove from gallery" : "Save to gallery"}
            onClick={() => actions.onToggleSaved(record)}
          >
            {record.savedAt ? (
              <StarOff className="h-3.5 w-3.5" />
            ) : (
              <Star className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Add to tileset"
            aria-label="Add generated image to tileset"
            onClick={() => actions.onAddToTileset(record)}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Open in image editor"
            aria-label="Open generated image in image editor"
            onClick={() => actions.onOpenInEditor(record)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Delete"
            aria-label="Delete generated image"
            onClick={() => actions.onDelete(record)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
