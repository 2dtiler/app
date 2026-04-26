import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import { prepareTiledTilesetImport } from "@/features/import-export/lib/tiled-tileset-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { TiledMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  ImportExportArchiveEntry,
  PendingTiledTilesetImportState,
  TiledImportMissingResource,
  TiledTilesetFormat,
  Tileset,
} from "@/types";

const TILED_TILESET_IMPORT_ACCEPT =
  ".tsx,.xml,.tsj,.json,.lua,text/xml,application/xml,application/json,text/json,text/plain,application/octet-stream";

function getTiledImportLabel(format: TiledTilesetFormat) {
  if (format === "json") {
    return "Tiled JSON";
  }

  if (format === "lua") {
    return "Tiled Lua";
  }

  return "TSX";
}

function detectTiledTilesetFormat(fileName: string): TiledTilesetFormat | null {
  const normalizedFileName = fileName.toLowerCase();

  if (
    normalizedFileName.endsWith(".tsx") ||
    normalizedFileName.endsWith(".xml")
  ) {
    return "xml";
  }

  if (
    normalizedFileName.endsWith(".tsj") ||
    normalizedFileName.endsWith(".json")
  ) {
    return "json";
  }

  if (normalizedFileName.endsWith(".lua")) {
    return "lua";
  }

  return null;
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

export function useTiledTilesetImport(
  enabled: boolean,
  onImportResolved: (imported: Tileset[]) => void,
) {
  const [pendingImport, setPendingImport] =
    useState<PendingTiledTilesetImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportTiledTileset = useCallback(async () => {
    if (!enabled) return false;

    const file = await pickSingleFile(
      TILED_TILESET_IMPORT_ACCEPT,
      "tiled-tileset-file",
    );
    if (!file) return false;

    const format = detectTiledTilesetFormat(file.name);
    if (!format) {
      alert("Unsupported Tiled tileset file type.");
      return false;
    }

    try {
      const rootData = await readFileAsUint8Array(file);
      const attempt = await prepareTiledTilesetImport(
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
        return true;
      }

      setPendingImport({
        format,
        rootPath: attempt.rootPath,
        rootData,
        missingResources: attempt.missingResources,
        resourceFilesByPath: {},
      });
      return true;
    } catch (error) {
      console.error(
        `[Import ${getTiledImportLabel(format)} Tileset] Failed:`,
        error,
      );
      alert(
        error instanceof Error
          ? error.message
          : `Failed to import ${getTiledImportLabel(format)} tileset.`,
      );
      return false;
    }
  }, [enabled, onImportResolved]);

  const handleSelectResourceFile = useCallback(
    async (resource: TiledImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
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
      const attempt = await prepareTiledTilesetImport(
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
        `[Import ${getTiledImportLabel(pendingImport.format)} Tileset] Failed:`,
        error,
      );
      alert(
        error instanceof Error
          ? error.message
          : `Failed to import ${getTiledImportLabel(pendingImport.format)} tileset.`,
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
    handleImportTiledTileset,
    tiledMissingResourcesDialogProps,
  };
}
