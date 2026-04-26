import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  UNITY_TILESET_IMPORT_ACCEPT,
  prepareUnityTilesetImport,
} from "@/features/import-export/lib/unity-tileset-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { UnityMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  ImportExportArchiveEntry,
  PendingUnityTilesetImportState,
  Tileset,
  UnityImportMissingResource,
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

export function useUnityTilesetImport(
  enabled: boolean,
  onImportResolved: (imported: Tileset[]) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingUnityTilesetImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportUnityTileset = useCallback(async () => {
    if (!enabled) return;

    const file = await pickSingleFile(
      UNITY_TILESET_IMPORT_ACCEPT,
      "unity-tileset-image-file",
    );
    if (!file) return;

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareUnityTilesetImport(file.name, [
        {
          path: file.name,
          data: rootData,
        },
      ]);

      if (attempt.status === "ready") {
        onImportResolved(attempt.result);
        return;
      }

      setPendingImport({
        rootPath: attempt.rootPath,
        rootData,
        missingResources: attempt.missingResources,
        resourceFilesByPath: {},
      });
    } catch (error) {
      console.error("[Import Unity Tileset] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Unity tileset bundle.",
      );
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: UnityImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `unity-tileset-resource-${resource.kind}`,
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
      const attempt = await prepareUnityTilesetImport(pendingImport.rootPath, [
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
      console.error("[Import Unity Tileset] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Unity tileset bundle.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const unityMissingResourcesDialogProps: UnityMissingResourcesDialogProps = {
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
    handleImportUnityTileset,
    unityMissingResourcesDialogProps,
  };
}