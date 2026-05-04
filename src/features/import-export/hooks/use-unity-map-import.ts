import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  UNITY_PREFAB_IMPORT_ACCEPT,
  prepareUnityMapImport,
} from "@/features/import-export/lib/unity-map-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { UnityMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  ImportExportArchiveEntry,
  PendingUnityMapImportState,
  UnityImportMissingResource,
  UnityMapImportResult,
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

export function useUnityMapImport(
  enabled: boolean,
  onImportResolved: (imported: UnityMapImportResult) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingUnityMapImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportUnityMap = useCallback(async (preselectedFile?: File) => {
    if (!enabled) return false;

    const file =
      preselectedFile ??
      (await pickSingleFile(UNITY_PREFAB_IMPORT_ACCEPT, "unity-prefab-file"));
    if (!file) return false;

    if (!file.name.toLowerCase().endsWith(".prefab")) {
      alert("Unsupported Unity prefab file type.");
      return false;
    }

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareUnityMapImport(file.name, [
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
      console.error("[Import Unity Tilemap] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Unity Tilemap prefab bundle.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: UnityImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `unity-resource-${resource.kind}`,
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
      const attempt = await prepareUnityMapImport(pendingImport.rootPath, [
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
      console.error("[Import Unity Tilemap] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Unity Tilemap prefab bundle.",
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
    handleImportUnityMap,
    unityMissingResourcesDialogProps,
  };
}
