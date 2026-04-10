import { Loader2, X } from "lucide-react";
import type { ImageState } from "@/types/ai-assets";

export function ImageCell({
  state,
  index,
}: {
  state: ImageState;
  index: number;
}) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/30 flex items-center justify-center">
      {state.status === "idle" && (
        <span className="text-xs text-muted-foreground select-none">
          #{index + 1}
        </span>
      )}

      {state.status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Generating...</span>
        </div>
      )}

      {state.status === "done" && (
        <img
          src={state.url}
          alt={`Generated image ${index + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {state.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <X className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-xs text-destructive leading-snug">
            {state.message}
          </p>
        </div>
      )}
    </div>
  );
}
