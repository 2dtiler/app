import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import { prepareTiledMapImport } from "@/features/import-export/lib/tiled-map-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import type { TiledMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  ImportExportArchiveEntry,
  PendingTiledMapImportState,
  TiledImportMissingResource,
  TiledMapFormat,
  TiledMapImportResult,
} from "@/types";

const TILED_IMPORT_ACCEPT_BY_FORMAT: Record<TiledMapFormat, string> = {
  xml: ".tmx,.xml,text/xml,application/xml",
  json: ".tmj,.json,application/json,text/json",
  js: ".js,application/javascript,text/javascript,application/ecmascript,text/ecmascript",
  lua: ".lua,text/plain,application/octet-stream",
};

const TILED_RESOURCE_ACCEPT_BY_KIND: Record<
  TiledImportMissingResource["kind"],
  string
> = {
  tsx: ".tsx,.xml,text/xml,application/xml",
  tsj: ".tsj,.json,application/json,text/json",
  lua: ".lua,text/plain,application/octet-stream",
  image: ".png,.jpg,.jpeg,.gif,.bmp,.webp,image/*",
};

function getTiledImportLabel(format: TiledMapFormat) {
  if (format === "json") {
    return "Tiled JSON";
  }
  if (format === "js") {
    return "Tiled JavaScript";
  }
  if (format === "lua") {
    return "Tiled Lua";
  }
  return "TMX";
}

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

  const handleImportTiledMap = useCallback(
    async (format: TiledMapFormat) => {
      if (!enabled) return;

      const file = await pickSingleFile(
        TILED_IMPORT_ACCEPT_BY_FORMAT[format],
        `${format}-tiled-map-file`,
      );
      if (!file) return;

      try {
        const rootData = await readFileAsUint8Array(file);
        const attempt = await prepareTiledMapImport(
          file.name,
          [
            {
              path: file.name,
              data: rootData,
            },
          ],
          format,
        );

        if (attempt.status === "ready") {
          onImportResolved(attempt.result);
          return;
        }

        setPendingImport({
          format,
          rootPath: attempt.rootPath,
          rootData,
          missingResources: attempt.missingResources,
          resourceFilesByPath: {},
        });
      } catch (error) {
        console.error(`[Import ${getTiledImportLabel(format)}] Failed:`, error);
        alert(
          error instanceof Error
            ? error.message
            : `Failed to import ${getTiledImportLabel(format)} map.`,
        );
      }
    },
    [enabled, onImportResolved],
  );

  const handleSelectResourceFile = useCallback(
    async (resource: TiledImportMissingResource) => {
      const file = await pickSingleFile(
        TILED_RESOURCE_ACCEPT_BY_KIND[resource.kind],
        `tiled-resource-${resource.kind}`,
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
      const attempt = await prepareTiledMapImport(
        pendingImport.rootPath,
        [
          {
            path: pendingImport.rootPath,
            data: pendingImport.rootData,
          },
          ...supplementalEntries,
        ],
        pendingImport.format,
      );

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
      console.error(
        `[Import ${getTiledImportLabel(pendingImport.format)}] Failed:`,
        error,
      );
      alert(
        error instanceof Error
          ? error.message
          : `Failed to import ${getTiledImportLabel(pendingImport.format)} map.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const tiledMissingResourcesDialogProps: TiledMissingResourcesDialogProps = {
    open: pendingImport !== null,
    onOpenChange: handleDialogOpenChange,
    format: pendingImport?.format ?? "xml",
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
