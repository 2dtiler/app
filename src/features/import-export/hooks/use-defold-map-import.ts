import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  DEFOLD_MAP_IMPORT_ACCEPT,
  prepareDefoldMapImport,
} from "@/features/import-export/lib/import-export-defold";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { DefoldMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  DefoldImportMissingResource,
  DefoldMapImportResult,
  ImportExportArchiveEntry,
  PendingDefoldMapImportState,
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

export function useDefoldMapImport(
  enabled: boolean,
  onImportResolved: (imported: DefoldMapImportResult) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingDefoldMapImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportDefoldMap = useCallback(async (preselectedFile?: File) => {
    if (!enabled) return false;

    const file =
      preselectedFile ??
      (await pickSingleFile(DEFOLD_MAP_IMPORT_ACCEPT, "defold-map-file"));
    if (!file) return false;

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareDefoldMapImport(file.name, [
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
        format: attempt.format,
        rootPath: attempt.rootPath,
        rootData,
        missingResources: attempt.missingResources,
        resourceFilesByPath: {},
      });
      return true;
    } catch (error) {
      console.error("[Import Defold Map] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import Defold map.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: DefoldImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `defold-resource-${resource.kind}`,
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
      const attempt = await prepareDefoldMapImport(pendingImport.rootPath, [
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
            format: attempt.format,
            missingResources: attempt.missingResources,
          };
        });
        return;
      }

      setPendingImport(null);
      onImportResolved(attempt.result);
    } catch (error) {
      console.error("[Import Defold Map] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import Defold map.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const defoldMissingResourcesDialogProps: DefoldMissingResourcesDialogProps = {
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
    handleImportDefoldMap,
    defoldMissingResourcesDialogProps,
  };
}
