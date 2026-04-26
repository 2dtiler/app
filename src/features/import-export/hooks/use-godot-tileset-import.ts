import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  GODOT_TILESET_IMPORT_ACCEPT,
  prepareGodotTilesetImport,
} from "@/features/import-export/lib/godot-tileset-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { GodotMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  GodotImportMissingResource,
  ImportExportArchiveEntry,
  PendingGodotTilesetImportState,
  Tileset,
} from "@/types";

async function createImportEntry(
  path: string,
  file: File,
): Promise<ImportExportArchiveEntry> {
  return {
    path,
    data: await readFileAsUint8Array(file),
  };
}

export function useGodotTilesetImport(
  enabled: boolean,
  onImportResolved: (imported: Tileset[]) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingGodotTilesetImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportGodotTileset = useCallback(async () => {
    if (!enabled) return false;

    const file = await pickSingleFile(
      GODOT_TILESET_IMPORT_ACCEPT,
      "godot-tileset-file",
    );
    if (!file) return false;

    if (!file.name.toLowerCase().endsWith(".tres")) {
      alert("Unsupported Godot tileset file type.");
      return false;
    }

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareGodotTilesetImport(file.name, [
        {
          path: file.name,
          data: rootData,
        },
      ]);

      if (attempt.status === "ready") {
        onImportResolved(attempt.result);
        return true;
      }

      setPendingImport({
        rootPath: attempt.rootPath,
        rootData,
        missingResources: attempt.missingResources,
        resourceFilesByPath: {},
      });
      return true;
    } catch (error) {
      console.error("[Import Godot TileSet] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot TileSet.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: GodotImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `godot-resource-${resource.kind}`,
      );
      if (!file) return;

      setPendingImport((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          resourceFilesByPath: {
            ...current.resourceFilesByPath,
            [resource.path]: file,
          },
        };
      });
    },
    [],
  );

  const handleResolveImport = useCallback(async () => {
    if (!pendingImport) return;

    const missingSelection = pendingImport.missingResources.find(
      (resource) => !pendingImport.resourceFilesByPath[resource.path],
    );
    if (missingSelection) {
      return;
    }

    setIsSubmitting(true);

    try {
      const supplementalEntries = await Promise.all(
        Object.entries(pendingImport.resourceFilesByPath).map(([path, file]) =>
          createImportEntry(path, file),
        ),
      );
      const attempt = await prepareGodotTilesetImport(pendingImport.rootPath, [
        {
          path: pendingImport.rootPath,
          data: pendingImport.rootData,
        },
        ...supplementalEntries,
      ]);

      if (attempt.status === "missing-resources") {
        setPendingImport((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            missingResources: attempt.missingResources,
          };
        });
        return;
      }

      setPendingImport(null);
      onImportResolved(attempt.result);
    } catch (error) {
      console.error("[Import Godot TileSet] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot TileSet.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const godotMissingResourcesDialogProps: GodotMissingResourcesDialogProps = {
    open: pendingImport !== null,
    onOpenChange: handleDialogOpenChange,
    resources: pendingImport?.missingResources ?? [],
    selectedFileNames: Object.fromEntries(
      Object.entries(pendingImport?.resourceFilesByPath ?? {}).map(
        ([path, file]) => [path, file.name],
      ),
    ),
    isSubmitting,
    onSelectFile: handleSelectResourceFile,
    onImport: handleResolveImport,
  };

  return {
    handleImportGodotTileset,
    godotMissingResourcesDialogProps,
  };
}
