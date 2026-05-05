import { useCallback, useState } from "react";
import { readFileAsUint8Array } from "@/utils/format";
import {
  pickDirectoryFiles,
  pickSingleFile,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  deriveImportedGodotProjectName,
  GODOT_PROJECT_FOLDER_ACCEPT,
  GODOT_PROJECT_IMPORT_ACCEPT,
  isGodotProjectFile,
  parseGodotProjectMetadata,
  prepareGodotProjectArchive,
  prepareGodotProjectImport,
} from "@/features/import-export/lib/import-export-godot-project";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import { normalizeBundlePath } from "@/features/import-export/lib/tiled-xml-utils";
import type {
  DirectoryImportFile,
  GodotImportMissingResource,
  GodotMissingResourcesDialogProps,
  GodotProjectFilesDialogProps,
  GodotProjectImportResult,
  ImportExportArchiveEntry,
  PendingGodotProjectFilesImportState,
  PendingGodotProjectImportState,
} from "@/types";

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

export function useGodotProjectImport(
  onImportResolved: (
    result: GodotProjectImportResult,
    suggestedProjectName: string,
  ) => void | Promise<void>,
) {
  const [pendingProjectFilesImport, setPendingProjectFilesImport] =
    useState<PendingGodotProjectFilesImportState | null>(null);
  const [pendingImport, setPendingImport] =
    useState<PendingGodotProjectImportState | null>(null);
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

  const handleImportGodotProject = useCallback(async () => {
    const file = await pickSingleFile(
      GODOT_PROJECT_IMPORT_ACCEPT,
      "godot-project-file",
    );
    if (!file) return false;

    try {
      const data = await readFileAsUint8Array(file);

      if (isZipArchive(file.name)) {
        const prepared = await prepareGodotProjectArchive(data);

        if (prepared.preparation.status === "missing-resources") {
          setPendingImport({
            projectName: prepared.projectName,
            baseEntries: prepared.entries,
            missingResources: prepared.preparation.missingResources,
            resourceFilesByPath: {},
          });
          return true;
        }

        await onImportResolved(
          prepared.preparation.result,
          prepared.projectName,
        );
        return true;
      }

      if (!isGodotProjectFile(file.name)) {
        alert("Unsupported Godot project file type.");
        return false;
      }

      const fallbackName = deriveImportedGodotProjectName(file.name);
      const projectName = parseGodotProjectMetadata(data, fallbackName).name;

      setPendingProjectFilesImport({
        projectName,
        projectFileName: file.name,
        projectData: data,
      });
      return true;
    } catch (error) {
      console.error("[Import Godot Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot project.",
      );
      return false;
    }
  }, [onImportResolved]);

  const handleSelectProjectFolder = useCallback(async () => {
    if (!pendingProjectFilesImport) return;

    const folderFiles = await pickDirectoryFiles(
      GODOT_PROJECT_FOLDER_ACCEPT,
      "godot-project-folder",
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
      const attempt = await prepareGodotProjectImport(baseEntries);

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

      setPendingProjectFilesImport(null);
      await onImportResolved(
        attempt.result,
        pendingProjectFilesImport.projectName,
      );
    } catch (error) {
      console.error("[Import Godot Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot project.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [onImportResolved, pendingProjectFilesImport]);

  const handleSelectResourceFile = useCallback(
    async (resource: GodotImportMissingResource) => {
      const file = await pickSingleFile(
        getLinkedImportResourceAccept(resource.kind),
        `godot-project-resource-${resource.kind}`,
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
      const attempt = await prepareGodotProjectImport([
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
      console.error("[Import Godot Project] Failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import Godot project.",
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

  const godotProjectFilesDialogProps: GodotProjectFilesDialogProps = {
    open: pendingProjectFilesImport !== null,
    projectName: pendingProjectFilesImport?.projectName ?? "Godot project",
    isSubmitting,
    onOpenChange: handleProjectFilesDialogOpenChange,
    onSelectFolder: handleSelectProjectFolder,
  };

  return {
    handleImportGodotProject,
    godotMissingResourcesDialogProps,
    godotProjectFilesDialogProps,
  };
}
