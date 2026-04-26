import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/utils/cn";
import { ExportAssetPicker } from "./import-export/ExportAssetPicker";
import { DefoldMapExportOptionsPanel } from "./import-export/DefoldMapExportOptionsPanel";
import { GameMakerMapExportOptionsPanel } from "./import-export/GameMakerMapExportOptionsPanel";
import { GodotMapExportOptionsPanel } from "./import-export/GodotMapExportOptionsPanel";
import { RasterExportOptionsPanel } from "./import-export/RasterExportOptionsPanel";
import { TiledMapExportOptionsPanel } from "./import-export/TiledMapExportOptionsPanel";
import { TiledTilesetExportOptionsPanel } from "./import-export/TiledTilesetExportOptionsPanel";
import type {
  DefoldMapExportOptions,
  GameMakerMapExportOptions,
  GodotMapExportOptions,
  ImportExportAssetType,
  ImportExportDialogProps,
  ImportExportDialogMode,
  ImportExportFormatExportOptions,
  ImportExportOptionAction,
  ImportExportOptionDefinition,
  ImportExportOptionId,
  ImportExportRasterExportOptions,
  ImportExportSelectableAssetId,
  TiledMapExportOptions,
  TiledTilesetExportOptions,
} from "@/features/import-export/types";
import { DEFAULT_GODOT_MAP_EXPORT_OPTIONS } from "@/features/import-export/lib/godot-scene-utils";
import { DEFAULT_RASTER_EXPORT_OPTIONS } from "@/features/import-export/lib/import-export-raster";

const optionDefinitions: ImportExportOptionDefinition[] = [
  {
    id: "project-native",
    assetType: "project",
    label: "2D Tiler Project (.2dp)",
    description: "Import or export Native 2D Tiler project files.",
    supportedNow: true,
  },
  {
    id: "project-tiled",
    assetType: "project",
    label: "Tiled Project (.tiled-project)",
    description: "Tiled multi-map project container.",
    supportedNow: false,
  },
  {
    id: "map-native",
    assetType: "map",
    label: "2D Tiler Map (.2dm)",
    description: "Import or export Native 2D Tiler map files.",
    supportedNow: true,
  },
  {
    id: "map-image",
    assetType: "map",
    label: "Image: PNG/JPG/WebP/BMP/GIF",
    description: "Raster image export and import targets.",
    supportedNow: true,
  },
  {
    id: "map-phaser",
    assetType: "map",
    label: "Phaser.js Map Bundle (.json)",
    description:
      "Imports and exports Phaser-ready Tiled JSON map bundles with inline tileset data and linked tileset images.",
    supportedNow: true,
  },
  {
    id: "map-tiled",
    assetType: "map",
    label: "Tiled Map Export",
    description:
      "Exports Tiled XML, JSON, JavaScript, Lua, or CSV map files from a single settings panel.",
    supportedNow: true,
    supportedModes: ["export"],
  },
  {
    id: "map-tiled-file",
    assetType: "map",
    label: "Tiled Map File (.tmx, .xml, .tmj, .json, .js, .lua)",
    description:
      "Imports Tiled TMX, XML, JSON, JavaScript, or Lua maps and prompts for linked resources when needed.",
    supportedNow: true,
    supportedModes: ["import"],
  },
  {
    id: "map-godot",
    assetType: "map",
    label: "Godot 4 Scene File (.tscn)",
    description: "Import or export Godot 4 scene files for maps.",
    supportedNow: true,
  },
  {
    id: "map-unity",
    assetType: "map",
    label: "Unity Tilemap Bundle (.prefab)",
    description:
      "Imports and exports Unity Tilemap prefab bundles, including 2D Tiler exports with linked manifests, Tile assets, and .meta resources.",
    supportedNow: true,
  },
  {
    id: "map-gamemaker",
    assetType: "map",
    label: "GameMaker Room (.room.gmx, .yy)",
    description:
      "Imports GameMaker room files and exports either legacy GMX or GameMaker Studio 2 YY rooms from one settings panel.",
    supportedNow: true,
  },
  {
    id: "map-defold",
    assetType: "map",
    label: "Defold Tilemap / Collection (.tilemap, .collection)",
    description:
      "Imports Defold tilemap and collection resources and exports either format from one Defold settings panel.",
    supportedNow: true,
  },
  {
    id: "map-tide",
    assetType: "map",
    label: "tIDE Maps (.tide)",
    description:
      "Imports tIDE XML maps and exports bundled tIDE map archives with linked tileset images.",
    supportedNow: true,
  },
  {
    id: "map-mappy-fmp",
    assetType: "map",
    label: "Mappy FMP (.fmp)",
    description:
      "Imports and exports standalone Mappy FMP 1.0 tile maps with up to 8 orthogonal tile layers.",
    supportedNow: true,
  },
  {
    id: "tileset-native",
    assetType: "tileset",
    label: "2D Tiler Tileset (.2dt)",
    description: "Import or export native 2D Tiler tileset files.",
    supportedNow: true,
  },
  {
    id: "tileset-image",
    assetType: "tileset",
    label: "Image: PNG/JPG/WebP/BMP/GIF",
    description: "Raster image tileset target.",
    supportedNow: true,
  },
  {
    id: "tileset-tiled",
    assetType: "tileset",
    label: "Tiled Tileset Export",
    description: "Exports Tiled XML, JSON, or Lua tileset bundles.",
    supportedNow: true,
    supportedModes: ["export"],
  },
  {
    id: "tileset-tiled-file",
    assetType: "tileset",
    label: "Tiled Tileset File (.tsx, .xml, .tsj, .json, .lua)",
    description:
      "Imports Tiled XML, JSON, or Lua tilesets and prompts for linked resources when needed.",
    supportedNow: true,
    supportedModes: ["import"],
  },
  {
    id: "tileset-defold",
    assetType: "tileset",
    label: "Defold Tile Source (.tilesource)",
    description:
      "Imports and exports Defold tile source resources with linked source images.",
    supportedNow: true,
  },
  {
    id: "tileset-godot",
    assetType: "tileset",
    label: "Godot 4 Tileset Bundle (.tres)",
    description: "Exports Godot 4 tileset resources for selected tilesets.",
    supportedNow: true,
    supportedModes: ["export"],
  },
  {
    id: "tileset-unity",
    assetType: "tileset",
    label: "Unity Sprite Sheet Bundle (.png + .meta)",
    description:
      "Imports and exports Unity sprite-sheet bundles using a texture image plus a Unity .meta sidecar with tile-size metadata.",
    supportedNow: true,
  },
];

const assetTabs: ImportExportAssetType[] = ["project", "map", "tileset"];
function isRasterImageOption(optionId: ImportExportOptionId) {
  return optionId === "map-image" || optionId === "tileset-image";
}

function isTiledMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-tiled";
}

function isTiledTilesetOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-tiled";
}

function isGodotMapExportOption(optionId: ImportExportOptionId) {
  return optionId === "map-godot";
}

function isGameMakerMapExportOption(optionId: ImportExportOptionId) {
  return optionId === "map-gamemaker";
}

function isDefoldMapExportOption(optionId: ImportExportOptionId) {
  return optionId === "map-defold";
}

function isExpandableExportOption(optionId: ImportExportOptionId) {
  return (
    isRasterImageOption(optionId) ||
    isTiledMapOption(optionId) ||
    isTiledTilesetOption(optionId) ||
    isGodotMapExportOption(optionId) ||
    isGameMakerMapExportOption(optionId) ||
    isDefoldMapExportOption(optionId)
  );
}

function createInitialRasterExportOptionsState() {
  return {
    map: { ...DEFAULT_RASTER_EXPORT_OPTIONS },
    tileset: { ...DEFAULT_RASTER_EXPORT_OPTIONS },
  } satisfies Record<"map" | "tileset", ImportExportRasterExportOptions>;
}

function createInitialTiledMapExportOptionsState() {
  return {
    map: {
      format: "xml",
      encoding: "base64",
      compression: "zlib",
      compressionLevel: 6,
      tilesetMode: "external",
      renderOrder: "right-down",
    },
  } as Record<"map", TiledMapExportOptions>;
}

function createInitialTiledTilesetExportOptionsState() {
  return {
    tileset: {
      format: "xml",
    },
  } as Record<"tileset", TiledTilesetExportOptions>;
}

function createInitialGodotMapExportOptionsState() {
  return {
    map: { ...DEFAULT_GODOT_MAP_EXPORT_OPTIONS },
  } as Record<"map", GodotMapExportOptions>;
}

function createInitialGameMakerMapExportOptionsState() {
  return {
    map: {
      format: "yy",
    },
  } as Record<"map", GameMakerMapExportOptions>;
}

function createInitialDefoldMapExportOptionsState() {
  return {
    map: {
      format: "collection",
    },
  } as Record<"map", DefoldMapExportOptions>;
}

function getActionForAssetType(
  assetType: ImportExportAssetType,
  actions: Pick<
    ImportExportDialogProps,
    "projectAction" | "mapAction" | "tilesetAction"
  >,
): ImportExportOptionAction {
  if (assetType === "project") return actions.projectAction;
  if (assetType === "map") return actions.mapAction;
  return actions.tilesetAction;
}

function getModeCopy(mode: ImportExportDialogMode) {
  if (mode === "import") {
    return {
      title: "Import assets",
      icon: Upload,
    };
  }

  return {
    title: "Export assets",
    icon: Download,
  };
}

function isOptionSupportedInMode(
  option: ImportExportOptionDefinition,
  mode: ImportExportDialogMode,
) {
  return option.supportedModes
    ? option.supportedModes.includes(mode)
    : option.supportedNow;
}

function getInitialSelectedIds(action: ImportExportOptionAction) {
  return action.exportSelection?.initialSelectedIds ?? [];
}

function createSelectedIdsState(
  actions: Pick<ImportExportDialogProps, "mapAction" | "tilesetAction">,
) {
  return {
    project: [] as ImportExportSelectableAssetId[],
    map: getInitialSelectedIds(actions.mapAction),
    tileset: getInitialSelectedIds(actions.tilesetAction),
  };
}

function getAvailableSelectionIds(action: ImportExportOptionAction) {
  return new Set(
    (action.exportSelection?.groups ?? []).flatMap((group) =>
      group.assets.map((asset) => asset.id),
    ),
  );
}

function syncSelectedIds(
  action: ImportExportOptionAction,
  selectedIds: ImportExportSelectableAssetId[],
) {
  const availableIds = getAvailableSelectionIds(action);
  return selectedIds.filter((selectedId) => availableIds.has(selectedId));
}

export function ImportExportDialog({
  open,
  onOpenChange,
  mode,
  projectAction,
  mapAction,
  tilesetAction,
}: ImportExportDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportExportAssetType>("project");
  const [selectedIdsByAssetType, setSelectedIdsByAssetType] = useState(() =>
    createSelectedIdsState({ mapAction, tilesetAction }),
  );
  const [expandedExportOptionId, setExpandedExportOptionId] =
    useState<ImportExportOptionId | null>(null);
  const [rasterExportOptionsByAssetType, setRasterExportOptionsByAssetType] =
    useState(createInitialRasterExportOptionsState);
  const [
    tiledMapExportOptionsByAssetType,
    setTiledMapExportOptionsByAssetType,
  ] = useState(createInitialTiledMapExportOptionsState);
  const [
    tiledTilesetExportOptionsByAssetType,
    setTiledTilesetExportOptionsByAssetType,
  ] = useState(createInitialTiledTilesetExportOptionsState);
  const [
    godotMapExportOptionsByAssetType,
    setGodotMapExportOptionsByAssetType,
  ] = useState(createInitialGodotMapExportOptionsState);
  const [
    gameMakerMapExportOptionsByAssetType,
    setGameMakerMapExportOptionsByAssetType,
  ] = useState(createInitialGameMakerMapExportOptionsState);
  const [
    defoldMapExportOptionsByAssetType,
    setDefoldMapExportOptionsByAssetType,
  ] = useState(createInitialDefoldMapExportOptionsState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modeCopy = getModeCopy(mode);
  const ModeIcon = modeCopy.icon;

  useEffect(() => {
    if (!open || mode !== "export") return;

    setSelectedIdsByAssetType({
      project: [],
      map: syncSelectedIds(mapAction, getInitialSelectedIds(mapAction)),
      tileset: syncSelectedIds(
        tilesetAction,
        getInitialSelectedIds(tilesetAction),
      ),
    });
  }, [mode, open, mapAction, tilesetAction]);

  useEffect(() => {
    if (!open) {
      setExpandedExportOptionId(null);
      setRasterExportOptionsByAssetType(
        createInitialRasterExportOptionsState(),
      );
      setTiledMapExportOptionsByAssetType(
        createInitialTiledMapExportOptionsState(),
      );
      setTiledTilesetExportOptionsByAssetType(
        createInitialTiledTilesetExportOptionsState(),
      );
      setGodotMapExportOptionsByAssetType(
        createInitialGodotMapExportOptionsState(),
      );
      setGameMakerMapExportOptionsByAssetType(
        createInitialGameMakerMapExportOptionsState(),
      );
      setDefoldMapExportOptionsByAssetType(
        createInitialDefoldMapExportOptionsState(),
      );
    }
  }, [open]);

  async function handleActionSelect(
    action: ImportExportOptionAction,
    selectedIds: ImportExportSelectableAssetId[],
    optionId: ImportExportOptionId,
    formatExportOptions?: ImportExportFormatExportOptions,
  ) {
    setIsSubmitting(true);

    try {
      let shouldClose = false;

      if (mode === "export" && action.exportSelection) {
        shouldClose = await action.exportSelection.onSubmit(
          selectedIds,
          optionId,
          formatExportOptions,
        );
      } else {
        shouldClose =
          (await action.onSelect?.(optionId, formatExportOptions)) ?? false;
      }

      if (shouldClose) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("[ImportExportDialog] Action failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggleAsset(
    assetType: ImportExportAssetType,
    assetId: ImportExportSelectableAssetId,
  ) {
    setSelectedIdsByAssetType((currentState) => {
      const nextSelectedIds = currentState[assetType].includes(assetId)
        ? currentState[assetType].filter(
            (currentAssetId) => currentAssetId !== assetId,
          )
        : [...currentState[assetType], assetId];

      return {
        ...currentState,
        [assetType]: nextSelectedIds,
      };
    });
  }

  function handleSelectAssets(
    assetType: ImportExportAssetType,
    assetIds: ImportExportSelectableAssetId[],
  ) {
    if (assetIds.length === 0) return;

    setSelectedIdsByAssetType((currentState) => {
      const nextSelectedIdSet = new Set(currentState[assetType]);

      for (const assetId of assetIds) {
        nextSelectedIdSet.add(assetId);
      }

      return {
        ...currentState,
        [assetType]: [...nextSelectedIdSet],
      };
    });
  }

  function handleDeselectAssets(
    assetType: ImportExportAssetType,
    assetIds: ImportExportSelectableAssetId[],
  ) {
    if (assetIds.length === 0) return;

    setSelectedIdsByAssetType((currentState) => ({
      ...currentState,
      [assetType]: currentState[assetType].filter(
        (currentAssetId) => !assetIds.includes(currentAssetId),
      ),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-2.5rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader className="gap-3 border-b border-border bg-linear-to-r from-secondary/70 via-background to-background px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-visible bg-background/80 text-foreground shadow-sm">
              <ModeIcon className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {mode === "import" ? "File intake" : "File delivery"}
              </div>
              <DialogTitle>{modeCopy.title}</DialogTitle>
              <DialogDescription className="max-w-2xl text-left">
                {mode === "import"
                  ? "Choose a supported file format to bring project, map, or tileset data into the current workspace."
                  : "Choose a supported file format to export selected project, map, or tileset data from the current workspace."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as ImportExportAssetType)
          }
          className="min-h-0 flex-1 overflow-hidden"
        >
          <div className="border-b border-border bg-background px-6 pt-4">
            <TabsList variant="line" className="w-full justify-start">
              {assetTabs.map((assetType) => (
                <TabsTrigger
                  key={assetType}
                  value={assetType}
                  className="capitalize"
                >
                  {assetType}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {assetTabs.map((assetType) => {
            const assetOptions = optionDefinitions.filter(
              (option) =>
                option.assetType === assetType &&
                (!option.supportedModes ||
                  option.supportedModes.includes(mode)),
            );
            const action = getActionForAssetType(assetType, {
              projectAction,
              mapAction,
              tilesetAction,
            });
            const exportSelection =
              mode === "export" ? action.exportSelection : undefined;
            const selectedIds = selectedIdsByAssetType[assetType] ?? [];
            const rasterExportOptions =
              assetType === "project"
                ? null
                : rasterExportOptionsByAssetType[assetType];
            const tiledMapExportOptions =
              assetType === "map" ? tiledMapExportOptionsByAssetType.map : null;
            const tiledTilesetExportOptions =
              assetType === "tileset"
                ? tiledTilesetExportOptionsByAssetType.tileset
                : null;
            const godotMapExportOptions =
              assetType === "map" ? godotMapExportOptionsByAssetType.map : null;
            const gameMakerMapExportOptions =
              assetType === "map"
                ? gameMakerMapExportOptionsByAssetType.map
                : null;
            const defoldMapExportOptions =
              assetType === "map"
                ? defoldMapExportOptionsByAssetType.map
                : null;
            const supportsRenderOrder =
              assetType === "map" && exportSelection
                ? exportSelection.groups
                    .flatMap((group) => group.assets)
                    .filter((asset) => selectedIds.includes(asset.id))
                    .every(
                      (asset) =>
                        asset.thumbnail.kind !== "map" ||
                        asset.thumbnail.orientation === "orthogonal",
                    )
                : true;

            return (
              <TabsContent
                key={assetType}
                value={assetType}
                className="min-h-0 flex-1 overflow-hidden"
              >
                <ScrollArea className="h-full min-h-0">
                  <div className="space-y-3 px-6 py-5">
                    {exportSelection ? (
                      <ExportAssetPicker
                        assetType={assetType}
                        selection={exportSelection}
                        selectedIds={selectedIds}
                        onToggleAsset={(assetId) =>
                          handleToggleAsset(assetType, assetId)
                        }
                        onSelectAssets={(assetIds) =>
                          handleSelectAssets(assetType, assetIds)
                        }
                        onDeselectAssets={(assetIds) =>
                          handleDeselectAssets(assetType, assetIds)
                        }
                      />
                    ) : null}

                    {assetOptions.map((option) => {
                      const isSupported = isOptionSupportedInMode(option, mode);
                      const isRasterOption =
                        mode === "export" && isRasterImageOption(option.id);
                      const isTiledMapExportAccordion =
                        mode === "export" && isTiledMapOption(option.id);
                      const isTiledTilesetExportAccordion =
                        mode === "export" && isTiledTilesetOption(option.id);
                      const isGodotMapExportAccordion =
                        mode === "export" && isGodotMapExportOption(option.id);
                      const isGameMakerMapExportAccordion =
                        mode === "export" &&
                        isGameMakerMapExportOption(option.id);
                      const isDefoldMapExportAccordion =
                        mode === "export" && isDefoldMapExportOption(option.id);
                      const hasSelection =
                        exportSelection === undefined || selectedIds.length > 0;
                      const isEnabled =
                        isSupported &&
                        action.enabled &&
                        Boolean(
                          exportSelection
                            ? exportSelection.onSubmit
                            : action.onSelect,
                        ) &&
                        hasSelection &&
                        !isSubmitting;
                      const statusLabel = isSupported
                        ? isEnabled
                          ? mode === "import"
                            ? "Import now"
                            : exportSelection && selectedIds.length > 1
                              ? `${selectedIds.length} selected`
                              : "Export now"
                          : exportSelection && !hasSelection
                            ? "Select at least one"
                            : (action.disabledReason ?? "Unavailable")
                        : option.supportedModes
                          ? mode === "import"
                            ? "Export only"
                            : "Import only"
                          : "Coming Soon";

                      return (
                        <div key={option.id} className="space-y-3">
                          <button
                            type="button"
                            disabled={!isEnabled}
                            onClick={() => {
                              if (!isEnabled) return;
                              if (
                                mode === "export" &&
                                isExpandableExportOption(option.id)
                              ) {
                                setExpandedExportOptionId((currentValue) =>
                                  currentValue === option.id ? null : option.id,
                                );
                                return;
                              }
                              void handleActionSelect(
                                action,
                                selectedIds,
                                option.id,
                              );
                            }}
                            aria-label={`${mode === "import" ? "Import" : "Export"} ${option.label}`}
                            className={cn(
                              "flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors",
                              isEnabled
                                ? "border-border-visible bg-background shadow-sm hover:border-primary/50 hover:bg-secondary/60 focus-visible:border-primary focus-visible:outline-none"
                                : isSupported
                                  ? "cursor-not-allowed border-border/70 bg-muted/20 text-muted-foreground"
                                  : "cursor-not-allowed border-dashed border-border-visible bg-secondary/25 text-muted-foreground",
                            )}
                          >
                            <div className="min-w-0 space-y-1">
                              <div
                                className={cn(
                                  "text-sm font-medium",
                                  isEnabled
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {option.label}
                              </div>
                              <p
                                className={cn(
                                  "text-xs leading-5",
                                  isEnabled
                                    ? "text-muted-foreground"
                                    : "text-muted-foreground/80",
                                )}
                              >
                                {option.description}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.08em]",
                                isEnabled
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : isSupported
                                    ? "border-border-visible bg-background/80 text-muted-foreground"
                                    : "border-border-visible bg-background/80 text-muted-foreground",
                              )}
                            >
                              {statusLabel}
                            </span>
                          </button>

                          {isRasterOption &&
                          expandedExportOptionId === option.id &&
                          rasterExportOptions ? (
                            <RasterExportOptionsPanel
                              options={rasterExportOptions}
                              disabled={!isEnabled}
                              onOptionsChange={(nextOptions) =>
                                setRasterExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    [assetType]: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}

                          {isTiledMapExportAccordion &&
                          expandedExportOptionId === option.id &&
                          tiledMapExportOptions ? (
                            <TiledMapExportOptionsPanel
                              options={tiledMapExportOptions}
                              disabled={!isEnabled}
                              supportsRenderOrder={supportsRenderOrder}
                              onOptionsChange={(nextOptions) =>
                                setTiledMapExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    map: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}

                          {isTiledTilesetExportAccordion &&
                          expandedExportOptionId === option.id &&
                          tiledTilesetExportOptions ? (
                            <TiledTilesetExportOptionsPanel
                              options={tiledTilesetExportOptions}
                              disabled={!isEnabled}
                              onOptionsChange={(nextOptions) =>
                                setTiledTilesetExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    tileset: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}

                          {isGodotMapExportAccordion &&
                          expandedExportOptionId === option.id &&
                          godotMapExportOptions ? (
                            <GodotMapExportOptionsPanel
                              options={godotMapExportOptions}
                              disabled={!isEnabled}
                              onOptionsChange={(nextOptions) =>
                                setGodotMapExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    map: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}

                          {isGameMakerMapExportAccordion &&
                          expandedExportOptionId === option.id &&
                          gameMakerMapExportOptions ? (
                            <GameMakerMapExportOptionsPanel
                              options={gameMakerMapExportOptions}
                              disabled={!isEnabled}
                              onOptionsChange={(nextOptions) =>
                                setGameMakerMapExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    map: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}

                          {isDefoldMapExportAccordion &&
                          expandedExportOptionId === option.id &&
                          defoldMapExportOptions ? (
                            <DefoldMapExportOptionsPanel
                              options={defoldMapExportOptions}
                              disabled={!isEnabled}
                              onOptionsChange={(nextOptions) =>
                                setDefoldMapExportOptionsByAssetType(
                                  (currentValue) => ({
                                    ...currentValue,
                                    map: nextOptions,
                                  }),
                                )
                              }
                              onExport={(nextOptions) => {
                                if (!isEnabled) return;
                                void handleActionSelect(
                                  action,
                                  selectedIds,
                                  option.id,
                                  nextOptions,
                                );
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}
        </Tabs>

        <DialogFooter
          className="border-t border-border px-6 py-4"
          showCloseButton
        />
      </DialogContent>
    </Dialog>
  );
}
