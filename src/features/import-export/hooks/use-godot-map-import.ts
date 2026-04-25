import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  GODOT_SCENE_IMPORT_ACCEPT,
  prepareGodotMapImport,
} from "@/features/import-export/lib/godot-map-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { GodotMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  GodotImportMissingResource,
  GodotMapImportResult,
  ImportExportArchiveEntry,
  PendingGodotMapImportState,
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

export function useGodotMapImport(
  enabled: boolean,
  onImportResolved: (imported: GodotMapImportResult) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingGodotMapImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportGodotMap = useCallback(async () => {
    if (!enabled) return;

    const file = await pickSingleFile(
      GODOT_SCENE_IMPORT_ACCEPT,
      "godot-scene-file",
    );
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".tscn")) {
      alert("Unsupported Godot scene file type.");
      return;
    }

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareGodotMapImport(file.name, [
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
      console.error("[Import Godot Scene] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot scene.",
      );
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
      const attempt = await prepareGodotMapImport(pendingImport.rootPath, [
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
      console.error("[Import Godot Scene] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot scene.",
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
    handleImportGodotMap,
    godotMissingResourcesDialogProps,
  };
}
