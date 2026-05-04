import { useCallback } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { importTiledProjectFromZip } from "@/features/import-export/lib/import-export-tiled-project";
import type { TiledProjectImportResult } from "@/types";

export function useTiledProjectImport(
  enabled: boolean,
  onImportResolved: (result: TiledProjectImportResult) => void,
) {
  const handleImportTiledProject = useCallback(async () => {
    if (!enabled) return false;

    const file = await pickSingleFile(
      ".zip,application/zip,application/x-zip-compressed",
      "tiled-project-file",
    );
    if (!file) return false;

    try {
      const data = await readFileAsUint8Array(file);
      const result = await importTiledProjectFromZip(data);

      if (result.maps.length === 0) {
        alert("No importable Tiled maps found in the archive.");
        return false;
      }

      onImportResolved(result);
      return true;
    } catch (error) {
      console.error("[Import Tiled Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Tiled project.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  return { handleImportTiledProject };
}
