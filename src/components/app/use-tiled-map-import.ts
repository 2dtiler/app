import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/lib/format";
import { prepareTiledMapImport } from "@/lib/tiled-map-import";
import { pickSingleFile } from "@/components/app/import-export-action-utils";
import type {
  ImportExportArchiveEntry,
  PendingTiledMapImportState,
  TiledImportMissingResource,
  TiledMapImportResult,
  TiledMissingResourcesDialogProps,
} from "@/types";

const TMX_IMPORT_ACCEPT = ".tmx,.xml,text/xml,application/xml";
const TMX_RESOURCE_ACCEPT_BY_KIND: Record<
  TiledImportMissingResource["kind"],
  string
> = {
  tsx: ".tsx,.xml,text/xml,application/xml",
  image: ".png,.jpg,.jpeg,.gif,.bmp,.webp,image/*",
};

async function createImportEntry(
  path: string,
  file: File,
): Promise<ImportExportArchiveEntry> {
  return {
    path,
    data: await readFileAsUint8Array(file),
  };
}

export function useTiledMapImport(
  enabled: boolean,
  onImportResolved: (imported: TiledMapImportResult) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingTiledMapImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportTiledMap = useCallback(async () => {
    if (!enabled) return;

    const file = await pickSingleFile(TMX_IMPORT_ACCEPT, "tmx-map-file");
    if (!file) return;

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareTiledMapImport(file.name, [
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
      console.error("[Import TMX] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import TMX map.",
      );
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: TiledImportMissingResource) => {
      const file = await pickSingleFile(
        TMX_RESOURCE_ACCEPT_BY_KIND[resource.kind],
        `tmx-resource-${resource.kind}`,
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
        Object.entries(pendingImport.resourceFilesByPath).map(
          ([path, file]) =>
            createImportEntry(
              path,
              file,
            ),
        ),
      );
      const attempt = await prepareTiledMapImport(pendingImport.rootPath, [
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
      console.error("[Import TMX] Failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import TMX map.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const tiledMissingResourcesDialogProps: TiledMissingResourcesDialogProps = {
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
    handleImportTiledMap,
    tiledMissingResourcesDialogProps,
  };
}
