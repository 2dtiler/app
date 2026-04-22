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
import { cn } from "@/lib/utils";
import { ExportAssetPicker } from "./import-export/ExportAssetPicker";
import { RasterExportOptionsPanel } from "./import-export/RasterExportOptionsPanel";
import { TiledXmlExportOptionsPanel } from "./import-export/TiledXmlExportOptionsPanel";
import type {
  ImportExportAssetType,
  ImportExportDialogMode,
  ImportExportFormatExportOptions,
  ImportExportRasterExportOptions,
  ImportExportOptionId,
  ImportExportOptionAction,
  ImportExportOptionDefinition,
  ImportExportSelectableAssetId,
  TiledMapExportOptions,
} from "@/types";
import type { ImportExportDialogProps } from "@/types/dialogs";
import { DEFAULT_RASTER_EXPORT_OPTIONS } from "@/lib/import-export-raster";

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
    id: "map-tiled-xml",
    assetType: "map",
    label: "Tiled XML Map File (.tmx, .xml)",
    description:
      "Imports or exports TMX/XML maps directly and prompts for linked TSX or image files when needed.",
    supportedNow: true,
  },
  {
    id: "map-tiled-json",
    assetType: "map",
    label: "Tiled JSON Map File (.tmj, .json)",
    description:
      "Imports or exports Tiled JSON maps directly and prompts for linked TSJ or image files when needed.",
    supportedNow: true,
  },
  {
    id: "map-tiled-js",
    assetType: "map",
    label: "Tiled JavaScript Map File (.js)",
    description:
      "Imports or exports Tiled JavaScript maps directly and prompts for linked TSJ/TSX or image files when needed.",
    supportedNow: true,
  },
  {
    id: "map-tiled-lua",
    assetType: "map",
    label: "Tiled Lua File (.lua)",
    description:
      "Imports or exports Tiled Lua maps directly and prompts for linked Lua tileset or image files when needed.",
    supportedNow: true,
  },
  {
    id: "map-tiled-csv",
    assetType: "map",
    label: "Tiled CSV File (.csv)",
    description: "Tiled CSV tile layer format.",
    supportedNow: false,
  },
  {
    id: "map-godot",
    assetType: "map",
    label: "Godot 4 Scene File (.tscn)",
    description: "Godot 4 scene export target.",
    supportedNow: false,
  },
  {
    id: "map-unity",
    assetType: "map",
    label: "Unity",
    description: "Unity map export target.",
    supportedNow: false,
  },
  {
    id: "map-gamemaker-room",
    assetType: "map",
    label: "GameMaker room File (.room.gmx)",
    description: "GameMaker room file target.",
    supportedNow: false,
  },
  {
    id: "map-gamemaker-studio-2",
    assetType: "map",
    label: "GameMaker Studio 2 file (.yy)",
    description: "GameMaker Studio 2 room data.",
    supportedNow: false,
  },
  {
    id: "map-defold-tilemap",
    assetType: "map",
    label: "Defold Tile Map (.tilemap)",
    description: "Defold tile map resource.",
    supportedNow: false,
  },
  {
    id: "map-defold-collection",
    assetType: "map",
    label: "Defold Collection (.collection)",
    description: "Defold collection scene target.",
    supportedNow: false,
  },
  {
    id: "map-tide",
    assetType: "map",
    label: "tIDE Map Format (.tide)",
    description: "tIDE map export format.",
    supportedNow: false,
  },
  {
    id: "map-tbin",
    assetType: "map",
    label: "tBIN Map Format (.tbin)",
    description: "tIDE binary map export format.",
    supportedNow: false,
  },
  {
    id: "map-mappy-fmp",
    assetType: "map",
    label: "Mappy FMP (.fmp)",
    description: "Mappy FMP export format.",
    supportedNow: false,
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
    id: "tileset-tiled-xml",
    assetType: "tileset",
    label: "Tiled XML Tileset File (.tsx, .xml)",
    description: "Tiled XML tileset format.",
    supportedNow: false,
  },
  {
    id: "tileset-tiled-json",
    assetType: "tileset",
    label: "Tiled JSON Tileset File (.tsj, .json)",
    description: "Tiled JSON tileset format.",
    supportedNow: false,
  },
  {
    id: "tileset-tiled-lua",
    assetType: "tileset",
    label: "Tiled Lua File (.lua)",
    description: "Tiled Lua tileset format.",
    supportedNow: false,
  },
  {
    id: "tileset-unity",
    assetType: "tileset",
    label: "Unity (.asset)",
    description: "Unity tileset asset target.",
    supportedNow: false,
  },
  {
    id: "tileset-godot",
    assetType: "tileset",
    label: "Godot (.tres)",
    description: "Godot tileset resource format.",
    supportedNow: false,
  },
  {
    id: "tileset-rpg-maker",
    assetType: "tileset",
    label: "RPG Maker",
    description: "RPG Maker tileset target.",
    supportedNow: false,
  },
];

const assetTabs: ImportExportAssetType[] = ["project", "map", "tileset"];
function isRasterImageOption(optionId: ImportExportOptionId) {
  return optionId === "map-image" || optionId === "tileset-image";
}

function isTiledMapOption(optionId: ImportExportOptionId) {
  return (
    optionId === "map-tiled-xml" ||
    optionId === "map-tiled-json" ||
    optionId === "map-tiled-js" ||
    optionId === "map-tiled-lua"
  );
}

function isExpandableExportOption(optionId: ImportExportOptionId) {
  return isRasterImageOption(optionId) || isTiledMapOption(optionId);
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
      encoding: "base64",
      compression: "zlib",
      compressionLevel: 6,
      tilesetMode: "external",
      renderOrder: "right-down",
    },
  } as Record<"map", TiledMapExportOptions>;
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
      if (mode === "export" && action.exportSelection) {
        await action.exportSelection.onSubmit(
          selectedIds,
          optionId,
          formatExportOptions,
        );
      } else {
        await action.onSelect?.(optionId, formatExportOptions);
      }

      onOpenChange(false);
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
              (option) => option.assetType === assetType,
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
                      const isRasterOption =
                        mode === "export" && isRasterImageOption(option.id);
                      const isTiledMapExportOption =
                        mode === "export" && isTiledMapOption(option.id);
                      const hasSelection =
                        exportSelection === undefined || selectedIds.length > 0;
                      const isEnabled =
                        option.supportedNow &&
                        action.enabled &&
                        Boolean(
                          exportSelection
                            ? exportSelection.onSubmit
                            : action.onSelect,
                        ) &&
                        hasSelection &&
                        !isSubmitting;
                      const statusLabel = option.supportedNow
                        ? isEnabled
                          ? mode === "import"
                            ? "Import now"
                            : exportSelection && selectedIds.length > 1
                              ? `${selectedIds.length} selected`
                              : "Export now"
                          : exportSelection && !hasSelection
                            ? "Select at least one"
                            : (action.disabledReason ?? "Unavailable")
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
                                : option.supportedNow
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
                                  : option.supportedNow
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

                          {isTiledMapExportOption &&
                          expandedExportOptionId === option.id &&
                          tiledMapExportOptions ? (
                            <TiledXmlExportOptionsPanel
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
