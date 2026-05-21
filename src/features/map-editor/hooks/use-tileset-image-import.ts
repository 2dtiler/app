import { useCallback, useState } from "react";
import { createPendingTilesetImageImport } from "@/features/map-editor/lib/tileset-image-import";
import type {
  PendingTilesetImageImport,
  QueueTilesetImageFileOptions,
  TilesetImageImportMode,
  TilesetImageImportPosition,
  UseTilesetImageImportResult,
} from "@/features/map-editor/types/tileset-import";

const INITIAL_PLACEMENT_POSITION: TilesetImageImportPosition = { x: 0, y: 0 };

export function useTilesetImageImport(): UseTilesetImageImportResult {
  const [pendingImport, setPendingImport] =
    useState<PendingTilesetImageImport | null>(null);
  const [mode, setMode] = useState<TilesetImageImportMode>("idle");
  const [placementPosition, setPlacementPosition] =
    useState<TilesetImageImportPosition>(INITIAL_PLACEMENT_POSITION);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPendingImport(null);
    setMode("idle");
    setPlacementPosition(INITIAL_PLACEMENT_POSITION);
    setIsLoading(false);
    setIsCommitting(false);
    setError(null);
  }, []);

  const queueImageFile = useCallback(
    async (
      file: File,
      options?: QueueTilesetImageFileOptions,
    ): Promise<PendingTilesetImageImport | null> => {
      setIsLoading(true);
      setError(null);
      setPendingImport(null);
      setMode("idle");

      try {
        const nextPendingImport = await createPendingTilesetImageImport(file);
        setPendingImport(nextPendingImport);
        setPlacementPosition(INITIAL_PLACEMENT_POSITION);
        setMode(options?.showChoiceDialog === false ? "idle" : "choice");
        return nextPendingImport;
      } catch (caughtError) {
        console.error("[Tileset Image Import] Failed:", caughtError);
        setError("Failed to load the selected image.");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const beginPlacement = useCallback(() => {
    if (!pendingImport) return;
    setError(null);
    setPlacementPosition(INITIAL_PLACEMENT_POSITION);
    setMode("placement");
  }, [pendingImport]);

  const updatePlacementPosition = useCallback(
    (position: TilesetImageImportPosition) => {
      setPlacementPosition(position);
    },
    [],
  );

  return {
    pendingImport,
    mode,
    placementPosition,
    isLoading,
    isCommitting,
    error,
    queueImageFile,
    beginPlacement,
    updatePlacementPosition,
    setCommitting: setIsCommitting,
    setError,
    reset,
  };
}
