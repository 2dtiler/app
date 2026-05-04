import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  prepareTideMapImport,
  TIDE_MAP_IMPORT_ACCEPT,
} from "@/features/import-export/lib/import-export-tide";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type {
  ImportExportArchiveEntry,
  PendingTideMapImportState,
  TideImportMissingResource,
  TideMapImportResult,
  TideMissingResourcesDialogProps,
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

export function useTideMapImport(
  enabled: boolean,
  onImportResolved: (imported: TideMapImportResult) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingTideMapImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportTideMap = useCallback(async (preselectedFile?: File) => {
    if (!enabled) return false;

    const file =
      preselectedFile ??
      (await pickSingleFile(TIDE_MAP_IMPORT_ACCEPT, "tide-map-file"));
    if (!file) return false;

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareTideMapImport(file.name, [
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
      console.error("[Import tIDE Map] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import tIDE map.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: TideImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `tide-resource-${resource.kind}`,
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
      const attempt = await prepareTideMapImport(pendingImport.rootPath, [
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
      console.error("[Import tIDE Map] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import tIDE map.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const tideMissingResourcesDialogProps: TideMissingResourcesDialogProps = {
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
    handleImportTideMap,
    tideMissingResourcesDialogProps,
  };
}
