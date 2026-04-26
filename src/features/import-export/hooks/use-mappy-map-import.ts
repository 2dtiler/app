import { useCallback } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  importMappyMap,
  MAPPY_MAP_IMPORT_ACCEPT,
} from "@/features/import-export/lib/import-export-mappy";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import type { MappyMapImportResult } from "@/types";

export function useMappyMapImport(
  enabled: boolean,
  onImportResolved: (imported: MappyMapImportResult) => void,
) {
  const handleImportMappyMap = useCallback(async () => {
    if (!enabled) return false;

    const file = await pickSingleFile(
      MAPPY_MAP_IMPORT_ACCEPT,
      "mappy-map-file",
    );
    if (!file) return false;

    try {
      const rootData = await readFileAsUint8Array(file);
      onImportResolved(await importMappyMap(file.name, rootData));
      return true;
    } catch (error) {
      console.error("[Import Mappy Map] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import Mappy map.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  return {
    handleImportMappyMap,
  };
}
