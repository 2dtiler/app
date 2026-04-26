import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadQuickExportPreference,
  loadQuickExportSaveTarget,
  saveQuickExportPreference,
  saveQuickExportSaveTarget,
} from "@/services/db";
import {
  saveBlobFileWithResult,
  saveByteArrayFileWithResult,
} from "@/services/file-system";
import {
  getExportOptionDefinitions,
  isExpandableExportOption,
} from "@/features/import-export/lib/import-export-options";
import type {
  ExportSaveStrategy,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  QuickExportAssetType,
  QuickExportControlState,
  QuickExportControllerParams,
  QuickExportControllerResult,
  QuickExportOptionSummary,
  QuickExportPreferenceRecord,
  QuickExportSaveTargetRecord,
  QuickExportSetupDialogProps,
  QuickExportSetupState,
} from "@/types";

function toOptionSummary(
  option: ReturnType<typeof getExportOptionDefinitions>[number],
): QuickExportOptionSummary {
  return {
    id: option.id,
    label: option.label,
    description: option.description,
  };
}

function buildPreferenceId(
  projectId: string,
  assetType: QuickExportAssetType,
  assetId: string,
): string {
  return `${projectId}:${assetType}:${assetId}`;
}

function findOptionLabel(
  options: QuickExportOptionSummary[],
  optionId: ImportExportOptionId | null,
): string | null {
  if (!optionId) {
    return null;
  }

  return options.find((option) => option.id === optionId)?.label ?? null;
}

function createEmptyControlState(
  assetType: QuickExportAssetType,
  options: QuickExportOptionSummary[],
): QuickExportControlState {
  return {
    assetType,
    assetId: null,
    assetLabel: null,
    disabled: true,
    disabledReason: "Open a project first",
    isExporting: false,
    onQuickExport: () => {},
    onSelectOption: () => {},
    options,
    selectedOptionId: null,
    selectedOptionLabel: null,
  };
}

export function useQuickExportController({
  activeMapId,
  activeTilesetId,
  project,
  handleMapExportSubmit,
  handleTilesetExportSubmit,
}: QuickExportControllerParams): QuickExportControllerResult {
  const mapOptions = useMemo(
    () => getExportOptionDefinitions("map").map(toOptionSummary),
    [],
  );
  const tilesetOptions = useMemo(
    () => getExportOptionDefinitions("tileset").map(toOptionSummary),
    [],
  );
  const [preferences, setPreferences] = useState<
    Record<QuickExportAssetType, QuickExportPreferenceRecord | null>
  >({
    map: null,
    tileset: null,
  });
  const [isExportingByAssetType, setIsExportingByAssetType] = useState<
    Record<QuickExportAssetType, boolean>
  >({
    map: false,
    tileset: false,
  });
  const [setupState, setSetupState] = useState<QuickExportSetupState | null>(
    null,
  );
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);

  const activeMap = useMemo(
    () => project?.maps.find((map) => map.id === activeMapId) ?? null,
    [activeMapId, project],
  );
  const activeTileset = useMemo(
    () =>
      project?.tilesets.find((tileset) => tileset.id === activeTilesetId) ??
      null,
    [activeTilesetId, project],
  );

  useEffect(() => {
    if (!project?.id || !activeMapId) {
      setPreferences((currentValue) => ({
        ...currentValue,
        map: null,
      }));
      return;
    }

    let cancelled = false;

    void loadQuickExportPreference(project.id, "map", activeMapId).then(
      (preference) => {
        if (cancelled) {
          return;
        }

        setPreferences((currentValue) => ({
          ...currentValue,
          map: preference ?? null,
        }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [activeMapId, project?.id]);

  useEffect(() => {
    if (!project?.id || !activeTilesetId) {
      setPreferences((currentValue) => ({
        ...currentValue,
        tileset: null,
      }));
      return;
    }

    let cancelled = false;

    void loadQuickExportPreference(project.id, "tileset", activeTilesetId).then(
      (preference) => {
        if (cancelled) {
          return;
        }

        setPreferences((currentValue) => ({
          ...currentValue,
          tileset: preference ?? null,
        }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [activeTilesetId, project?.id]);

  const persistPreference = useCallback(
    async (
      assetType: QuickExportAssetType,
      assetId: string,
      optionId: ImportExportOptionId,
      formatExportOptions?: ImportExportFormatExportOptions,
    ) => {
      if (!project?.id) {
        return;
      }

      const nextPreference: QuickExportPreferenceRecord = {
        id: buildPreferenceId(project.id, assetType, assetId),
        projectId: project.id,
        assetType,
        assetId,
        optionId,
        formatExportOptions,
        updatedAt: Date.now(),
      };

      setPreferences((currentValue) => ({
        ...currentValue,
        [assetType]: nextPreference,
      }));

      await saveQuickExportPreference({
        projectId: project.id,
        assetType,
        assetId,
        optionId,
        formatExportOptions,
      });
    },
    [project?.id],
  );

  const executeQuickExport = useCallback(
    async (
      assetType: QuickExportAssetType,
      assetId: string,
      optionId: ImportExportOptionId,
      formatExportOptions?: ImportExportFormatExportOptions,
    ) => {
      if (!project?.id) {
        return false;
      }

      const submitHandler =
        assetType === "map" ? handleMapExportSubmit : handleTilesetExportSubmit;

      setIsExportingByAssetType((currentValue) => ({
        ...currentValue,
        [assetType]: true,
      }));

      try {
        const savedTarget = await loadQuickExportSaveTarget(
          project.id,
          assetType,
          assetId,
          optionId,
        );

        const persistSaveTarget = async (
          filename: string,
          fileHandle?: QuickExportSaveTargetRecord["fileHandle"],
        ) => {
          await saveQuickExportSaveTarget({
            projectId: project.id,
            assetType,
            assetId,
            optionId,
            suggestedName: filename,
            fileHandle,
          });
        };

        const saveStrategy: ExportSaveStrategy = {
          saveBlob: async (blob, filename) => {
            const result = await saveBlobFileWithResult(blob, filename, {
              fileHandle: savedTarget?.fileHandle,
            });

            if (result.status !== "cancelled") {
              await persistSaveTarget(result.filename, result.fileHandle);
            }

            return result.status !== "cancelled";
          },
          saveByteArray: async (data, filename, mimeType) => {
            const result = await saveByteArrayFileWithResult(
              data,
              filename,
              mimeType,
              {
                fileHandle: savedTarget?.fileHandle,
              },
            );

            if (result.status !== "cancelled") {
              await persistSaveTarget(result.filename, result.fileHandle);
            }

            return result.status !== "cancelled";
          },
        };

        return submitHandler(
          [assetId],
          optionId,
          formatExportOptions,
          saveStrategy,
        );
      } finally {
        setIsExportingByAssetType((currentValue) => ({
          ...currentValue,
          [assetType]: false,
        }));
      }
    },
    [handleMapExportSubmit, handleTilesetExportSubmit, project?.id],
  );

  const openSetupDialog = useCallback(
    (assetType: QuickExportAssetType) => {
      const asset = assetType === "map" ? activeMap : activeTileset;
      const assetId = asset?.id ?? null;
      const assetLabel = asset?.name ?? null;
      if (!assetId || !assetLabel) {
        return;
      }

      const preference = preferences[assetType];
      setSetupState({
        assetId,
        assetLabel,
        assetType,
        initialOptionId: preference?.optionId ?? null,
        initialFormatExportOptions: preference?.formatExportOptions,
      });
    },
    [activeMap, activeTileset, preferences],
  );

  const handleQuickExport = useCallback(
    (assetType: QuickExportAssetType) => {
      const asset = assetType === "map" ? activeMap : activeTileset;
      const assetId = asset?.id ?? null;
      if (!project?.id || !assetId) {
        return;
      }

      const preference = preferences[assetType];
      if (!preference?.optionId) {
        openSetupDialog(assetType);
        return;
      }

      if (
        isExpandableExportOption(preference.optionId) &&
        !preference.formatExportOptions
      ) {
        openSetupDialog(assetType);
        return;
      }

      void executeQuickExport(
        assetType,
        assetId,
        preference.optionId,
        preference.formatExportOptions,
      );
    },
    [
      activeMap,
      activeTileset,
      executeQuickExport,
      openSetupDialog,
      preferences,
      project?.id,
    ],
  );

  const handleOptionSelect = useCallback(
    (assetType: QuickExportAssetType, optionId: ImportExportOptionId) => {
      const asset = assetType === "map" ? activeMap : activeTileset;
      const assetId = asset?.id ?? null;
      if (!project?.id || !assetId) {
        return;
      }

      const currentPreference = preferences[assetType];
      const formatExportOptions =
        currentPreference?.optionId === optionId
          ? currentPreference.formatExportOptions
          : undefined;

      void persistPreference(assetType, assetId, optionId, formatExportOptions);
    },
    [activeMap, activeTileset, persistPreference, preferences, project?.id],
  );

  const handleSetupSubmit = useCallback<
    QuickExportSetupDialogProps["onSubmit"]
  >(
    async (optionId, formatExportOptions) => {
      if (!setupState) {
        return false;
      }

      setIsSubmittingSetup(true);

      try {
        await persistPreference(
          setupState.assetType,
          setupState.assetId,
          optionId,
          formatExportOptions,
        );

        const didExport = await executeQuickExport(
          setupState.assetType,
          setupState.assetId,
          optionId,
          formatExportOptions,
        );

        if (didExport) {
          setSetupState(null);
        }

        return didExport;
      } finally {
        setIsSubmittingSetup(false);
      }
    },
    [executeQuickExport, persistPreference, setupState],
  );

  const mapQuickExport = useMemo<QuickExportControlState>(() => {
    if (!project) {
      return createEmptyControlState("map", mapOptions);
    }

    if (!activeMap) {
      return {
        ...createEmptyControlState("map", mapOptions),
        disabledReason: "Open a map first",
      };
    }

    const selectedOptionId = preferences.map?.optionId ?? null;
    return {
      assetType: "map",
      assetId: activeMap.id,
      assetLabel: activeMap.name,
      disabled: false,
      isExporting: isExportingByAssetType.map,
      onQuickExport: () => handleQuickExport("map"),
      onSelectOption: (optionId) => handleOptionSelect("map", optionId),
      options: mapOptions,
      selectedOptionId,
      selectedOptionLabel: findOptionLabel(mapOptions, selectedOptionId),
    };
  }, [
    activeMap,
    handleOptionSelect,
    handleQuickExport,
    isExportingByAssetType.map,
    mapOptions,
    preferences.map,
    project,
  ]);

  const tilesetQuickExport = useMemo<QuickExportControlState>(() => {
    if (!project) {
      return createEmptyControlState("tileset", tilesetOptions);
    }

    if (!activeTileset) {
      return {
        ...createEmptyControlState("tileset", tilesetOptions),
        disabledReason: "Open a tileset first",
      };
    }

    const selectedOptionId = preferences.tileset?.optionId ?? null;
    return {
      assetType: "tileset",
      assetId: activeTileset.id,
      assetLabel: activeTileset.name,
      disabled: false,
      isExporting: isExportingByAssetType.tileset,
      onQuickExport: () => handleQuickExport("tileset"),
      onSelectOption: (optionId) => handleOptionSelect("tileset", optionId),
      options: tilesetOptions,
      selectedOptionId,
      selectedOptionLabel: findOptionLabel(tilesetOptions, selectedOptionId),
    };
  }, [
    activeTileset,
    handleOptionSelect,
    handleQuickExport,
    isExportingByAssetType.tileset,
    preferences.tileset,
    project,
    tilesetOptions,
  ]);

  const quickExportSetupDialogProps = useMemo<QuickExportSetupDialogProps>(
    () => ({
      open: setupState !== null,
      assetType: setupState?.assetType ?? "map",
      assetLabel: setupState?.assetLabel ?? "",
      initialOptionId: setupState?.initialOptionId ?? null,
      initialFormatExportOptions: setupState?.initialFormatExportOptions,
      isSubmitting: isSubmittingSetup,
      optionSummaries:
        setupState?.assetType === "tileset" ? tilesetOptions : mapOptions,
      supportsRenderOrder: activeMap?.orientation === "orthogonal",
      onOpenChange: (open) => {
        if (!open) {
          setSetupState(null);
        }
      },
      onSubmit: handleSetupSubmit,
    }),
    [
      activeMap?.orientation,
      handleSetupSubmit,
      isSubmittingSetup,
      mapOptions,
      setupState,
      tilesetOptions,
    ],
  );

  return {
    mapQuickExport,
    quickExportSetupDialogProps,
    tilesetQuickExport,
  };
}
