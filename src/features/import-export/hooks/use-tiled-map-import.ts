import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import { prepareTiledMapImport } from "@/features/import-export/lib/tiled-map-import";
import { pickSingleFile } from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { TiledMissingResourcesDialogProps } from "@/features/import-export/types";
import type {
  ImportExportArchiveEntry,
  PendingTiledMapImportState,
  TiledImportMissingResource,
  TiledMapFormat,
  TiledMapImportResult,
} from "@/types";

const TILED_MAP_IMPORT_ACCEPT =
  ".tmx,.xml,.tmj,.json,.js,.lua,text/xml,application/xml,application/json,text/json,application/javascript,text/javascript,application/ecmascript,text/ecmascript,text/plain,application/octet-stream";

const PHASER_MAP_IMPORT_ACCEPT =
  ".tmj,.json,application/json,text/json,text/plain,application/octet-stream";

interface TiledMapImportConfig {
  accept: string;
  inputName: string;
  detectFormat: (fileName: string) => TiledMapFormat | null;
  getImportLabel: (format: TiledMapFormat) => string;
  unsupportedTypeMessage: string;
}

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

function detectTiledMapFormat(fileName: string): TiledMapFormat | null {
  const normalizedFileName = fileName.toLowerCase();

  if (
    normalizedFileName.endsWith(".tmx") ||
    normalizedFileName.endsWith(".xml")
  ) {
    return "xml";
  }

  if (
    normalizedFileName.endsWith(".tmj") ||
    normalizedFileName.endsWith(".json")
  ) {
    return "json";
  }

  if (normalizedFileName.endsWith(".js")) {
    return "js";
  }

  if (normalizedFileName.endsWith(".lua")) {
    return "lua";
  }

  return null;
}

function detectPhaserMapFormat(fileName: string): TiledMapFormat | null {
  const normalizedFileName = fileName.toLowerCase();

  if (
    normalizedFileName.endsWith(".tmj") ||
    normalizedFileName.endsWith(".json")
  ) {
    return "json";
  }

  return null;
}

const DEFAULT_TILED_MAP_IMPORT_CONFIG: TiledMapImportConfig = {
  accept: TILED_MAP_IMPORT_ACCEPT,
  inputName: "tiled-map-file",
  detectFormat: detectTiledMapFormat,
  getImportLabel: getTiledImportLabel,
  unsupportedTypeMessage: "Unsupported Tiled map file type.",
};

export const PHASER_MAP_IMPORT_CONFIG: TiledMapImportConfig = {
  accept: PHASER_MAP_IMPORT_ACCEPT,
  inputName: "phaser-map-file",
  detectFormat: detectPhaserMapFormat,
  getImportLabel: () => "Phaser Tiled JSON",
  unsupportedTypeMessage: "Unsupported Phaser map file type.",
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
  config: TiledMapImportConfig = DEFAULT_TILED_MAP_IMPORT_CONFIG,
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
    if (!enabled) return false;

    const file = await pickSingleFile(config.accept, config.inputName);
    if (!file) return false;

    const format = config.detectFormat(file.name);
    if (!format) {
      alert(config.unsupportedTypeMessage);
      return false;
    }

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
      console.error(`[Import ${config.getImportLabel(format)}] Failed:`, error);
      alert(
        error instanceof Error
          ? error.message
          : `Failed to import ${config.getImportLabel(format)} map.`,
      );
      return false;
    }
  }, [config, enabled, onImportResolved]);

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
        `[Import ${config.getImportLabel(pendingImport.format)}] Failed:`,
        error,
      );
      alert(
        error instanceof Error
          ? error.message
          : `Failed to import ${config.getImportLabel(pendingImport.format)} map.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [config, onImportResolved, pendingImport]);

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
