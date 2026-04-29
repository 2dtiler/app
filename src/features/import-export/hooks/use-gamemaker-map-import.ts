import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  GAME_MAKER_MAP_IMPORT_ACCEPT,
  prepareGameMakerMapImport,
} from "@/features/import-export/lib/gamemaker-map-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { GameMakerMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  GameMakerImportMissingResource,
  GameMakerMapImportResult,
  ImportExportArchiveEntry,
  PendingGameMakerMapImportState,
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

export function useGameMakerMapImport(
  enabled: boolean,
  onImportResolved: (imported: GameMakerMapImportResult) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingGameMakerMapImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportGameMakerMap = useCallback(async () => {
    if (!enabled) return false;

    const file = await pickSingleFile(
      GAME_MAKER_MAP_IMPORT_ACCEPT,
      "gamemaker-room-file",
    );
    if (!file) return false;

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareGameMakerMapImport(file.name, [
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
      console.error("[Import GameMaker Room] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import GameMaker room.",
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: GameMakerImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `gamemaker-resource-${resource.kind}`,
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
      const attempt = await prepareGameMakerMapImport(pendingImport.rootPath, [
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
      console.error("[Import GameMaker Room] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import GameMaker room.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const gameMakerMissingResourcesDialogProps: GameMakerMissingResourcesDialogProps =
    {
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
    handleImportGameMakerMap,
    gameMakerMissingResourcesDialogProps,
  };
}
