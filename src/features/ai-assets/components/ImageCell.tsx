import { Loader2, X } from "lucide-react";
import type { ImageState } from "@/types/integrations/ai-assets";

export function ImageCell({
  state,
  index,
}: {
  state: ImageState;
  index: number;
}) {
  return (
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
      {state.status === "idle" && (
        <span className="select-none text-xs text-muted-foreground">#{index + 1}</span>
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
          <X className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-xs leading-snug text-destructive">{state.message}</p>
        </div>
      )}
    </div>
  );
}