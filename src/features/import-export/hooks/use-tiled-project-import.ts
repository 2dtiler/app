import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  pickDirectoryFiles,
  pickSingleFile,
} from "@/features/import-export/lib/import-export-action-utils";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import {
  prepareTiledProjectArchive,
  prepareTiledProjectImport,
} from "@/features/import-export/lib/import-export-tiled-project";
import {
  decodeText,
  normalizeBundlePath,
} from "@/features/import-export/lib/tiled-xml-utils";
import type {
  TiledMissingResourcesDialogProps,
  TiledProjectFilesDialogProps,
} from "@/features/import-export/types";
import type {
  ImportExportArchiveEntry,
  PendingTiledProjectFilesImportState,
  PendingTiledProjectImportState,
  TiledImportMissingResource,
  TiledProjectImportResult,
} from "@/types";

const TILED_PROJECT_IMPORT_ACCEPT =
  ".tiled-project,.zip,application/zip,application/x-zip-compressed,application/json,text/json,text/plain,application/octet-stream";

const TILED_PROJECT_FOLDER_ACCEPT =
  ".tiled-project,.tmx,.xml,.tmj,.json,.js,.lua,.tsx,.tsj,.png,.jpg,.jpeg,.gif,.bmp,.webp,text/xml,application/xml,application/json,text/json,application/javascript,text/javascript,application/ecmascript,text/ecmascript,text/plain,application/octet-stream,image/*";

const TILED_PROJECT_DIALOG_DESCRIPTION =
  "Select the missing linked tileset and image files referenced by this Tiled project. If a chosen file references more files, this list will update after you continue.";

type DirectoryImportFile = File & {
  webkitRelativePath?: string;
};

async function createImportEntry(
  path: string,
  file: File,
): Promise<ImportExportArchiveEntry> {
  return {
    path: normalizeBundlePath(path),
    data: await readFileAsUint8Array(file),
  };
}

function isZipArchive(fileName: string) {
  return fileName.toLowerCase().endsWith(".zip");
}

function isTiledProjectFile(fileName: string) {
  return fileName.toLowerCase().endsWith(".tiled-project");
}

function deriveImportedTiledProjectName(fileName: string) {
  const normalizedFileName = fileName.trim();
  const withoutZip = normalizedFileName.replace(/\.zip$/i, "");
  const withoutProjectSuffix = withoutZip.replace(/\.tiled-project$/i, "");
  return withoutProjectSuffix || "Imported Tiled Project";
}

function validateTiledProjectFile(data: Uint8Array) {
  const parsed = JSON.parse(decodeText(data).replace(/^\uFEFF/, "")) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Tiled project file.");
  }
}

function getDirectoryImportPath(file: DirectoryImportFile) {
  const relativePath = normalizeBundlePath(
    file.webkitRelativePath || file.name,
  );
  const slashIndex = relativePath.indexOf("/");

  return slashIndex >= 0 ? relativePath.slice(slashIndex + 1) : relativePath;
}

async function createProjectSeedEntries(
  projectFileName: string,
  projectData: Uint8Array,
  folderFiles: readonly File[],
) {
  const entryMap = new Map<string, ImportExportArchiveEntry>();
  const normalizedProjectPath = normalizeBundlePath(projectFileName);

  entryMap.set(normalizedProjectPath, {
    path: normalizedProjectPath,
    data: projectData,
  });

  const folderEntries = await Promise.all(
    folderFiles.map((file) =>
      createImportEntry(
        getDirectoryImportPath(file as DirectoryImportFile),
        file,
      ),
    ),
  );

  for (const entry of folderEntries) {
    entryMap.set(entry.path, entry);
  }

  return [...entryMap.values()];
}

export function useTiledProjectImport(
  onImportResolved: (
    result: TiledProjectImportResult,
    suggestedProjectName: string,
  ) => void | Promise<void>,
) {
  const [pendingProjectFilesImport, setPendingProjectFilesImport] =
    useState<PendingTiledProjectFilesImportState | null>(null);
  const [pendingImport, setPendingImport] =
    useState<PendingTiledProjectImportState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingImport(null);
    setIsSubmitting(false);
  }, []);

  const handleProjectFilesDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    setPendingProjectFilesImport(null);
    setIsSubmitting(false);
  }, []);

  const handleImportTiledProject = useCallback(async () => {
    const file = await pickSingleFile(
      TILED_PROJECT_IMPORT_ACCEPT,
      "tiled-project-file",
    );
    if (!file) return false;

    try {
      const data = await readFileAsUint8Array(file);

      if (isZipArchive(file.name)) {
        const prepared = await prepareTiledProjectArchive(data);

        if (prepared.preparation.status === "missing-resources") {
          setPendingImport({
            projectName: deriveImportedTiledProjectName(file.name),
            baseEntries: prepared.entries,
            missingResources: prepared.preparation.missingResources,
            resourceFilesByPath: {},
          });
          return true;
        }

        if (prepared.preparation.result.maps.length === 0) {
          alert("No importable Tiled maps found in the archive.");
          return false;
        }

        await onImportResolved(
          prepared.preparation.result,
          deriveImportedTiledProjectName(file.name),
        );
        return true;
      }

      if (!isTiledProjectFile(file.name)) {
        alert("Unsupported Tiled project file type.");
        return false;
      }

      validateTiledProjectFile(data);

      setPendingProjectFilesImport({
        projectName: deriveImportedTiledProjectName(file.name),
        projectFileName: file.name,
        projectData: data,
      });
      return true;
    } catch (error) {
      console.error("[Import Tiled Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Tiled project.",
      );
      return false;
    }
  }, [onImportResolved]);

  const handleSelectProjectFolder = useCallback(async () => {
    if (!pendingProjectFilesImport) return;

    const folderFiles = await pickDirectoryFiles(
      TILED_PROJECT_FOLDER_ACCEPT,
      "tiled-project-folder",
    );
    if (!folderFiles || folderFiles.length === 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const baseEntries = await createProjectSeedEntries(
        pendingProjectFilesImport.projectFileName,
        pendingProjectFilesImport.projectData,
        folderFiles,
      );
      const attempt = await prepareTiledProjectImport(baseEntries);

      if (attempt.status === "missing-resources") {
        setPendingProjectFilesImport(null);
        setPendingImport({
          projectName: pendingProjectFilesImport.projectName,
          baseEntries,
          missingResources: attempt.missingResources,
          resourceFilesByPath: {},
        });
        return;
      }

      if (attempt.result.maps.length === 0) {
        alert("No importable Tiled maps found in the selected project files.");
        return;
      }

      setPendingProjectFilesImport(null);
      await onImportResolved(
        attempt.result,
        pendingProjectFilesImport.projectName,
      );
    } catch (error) {
      console.error("[Import Tiled Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Tiled project.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingProjectFilesImport]);

  const handleSelectResourceFile = useCallback(
    async (resource: TiledImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `tiled-project-resource-${resource.kind}`,
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
      const attempt = await prepareTiledProjectImport([
        ...pendingImport.baseEntries,
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
      await onImportResolved(attempt.result, pendingImport.projectName);
    } catch (error) {
      console.error("[Import Tiled Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Tiled project.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingImport]);

  const tiledMissingResourcesDialogProps: TiledMissingResourcesDialogProps = {
    open: pendingImport !== null,
    onOpenChange: handleDialogOpenChange,
    format: "xml",
    description: TILED_PROJECT_DIALOG_DESCRIPTION,
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

  const tiledProjectFilesDialogProps: TiledProjectFilesDialogProps = {
    open: pendingProjectFilesImport !== null,
    projectName: pendingProjectFilesImport?.projectName ?? "Tiled project",
    isSubmitting,
    onOpenChange: handleProjectFilesDialogOpenChange,
    onSelectFolder: handleSelectProjectFolder,
  };

  return {
    handleImportTiledProject,
    tiledMissingResourcesDialogProps,
    tiledProjectFilesDialogProps,
  };
}
