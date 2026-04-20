import { useState } from "react";
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
import type {
  ImportExportAssetType,
  ImportExportDialogMode,
  ImportExportOptionAction,
  ImportExportOptionDefinition,
} from "@/types";
import type { ImportExportDialogProps } from "@/types/dialogs";

const optionDefinitions: ImportExportOptionDefinition[] = [
  {
    assetType: "project",
    label: "2D Tiler Project (.2dp)",
    description: "Import or export Native 2D Tiler project files.",
    supportedNow: true,
  },
  {
    assetType: "project",
    label: "Tiled Project (.tiled-project)",
    description: "Tiled multi-map project container.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "2D Tiler Map (.2dm)",
    description: "Import or export Native 2D Tiler map files.",
    supportedNow: true,
  },
  {
    assetType: "map",
    label: "Image: PNG/JPG/WebP",
    description: "Raster image export and import targets.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Tiled XML Map File (.tmx, .xml)",
    description: "Tiled XML tile map format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Tiled JSON Map File (.tmj, .json)",
    description: "Tiled JSON tile map format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Tiled JavaScript Map File (.js)",
    description: "Tiled JavaScript export format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Tiled Lua File (.lua)",
    description: "Tiled Lua export format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Tiled CSV File (.csv)",
    description: "Tiled CSV tile layer format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Godot 4 Scene File (.tscn)",
    description: "Godot 4 scene export target.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Unity",
    description: "Unity map export target.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "GameMaker room File (.room.gmx)",
    description: "GameMaker room file target.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "GameMaker Studio 2 file (.yy)",
    description: "GameMaker Studio 2 room data.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Defold Tile Map (.tilemap)",
    description: "Defold tile map resource.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Defold Collection (.collection)",
    description: "Defold collection scene target.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "tIDE Map Format (.tide)",
    description: "tIDE map export format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "tBIN Map Format (.tbin)",
    description: "tIDE binary map export format.",
    supportedNow: false,
  },
  {
    assetType: "map",
    label: "Mappy FMP (.fmp)",
    description: "Mappy FMP export format.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "2D Tiler Tileset (.2dt)",
    description: "Import or export native 2D Tiler tileset files.",
    supportedNow: true,
  },
  {
    assetType: "tileset",
    label: "Image: PNG/JPG/WebP",
    description: "Raster image tileset target.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "Tiled XML Tileset File (.tsx, .xml)",
    description: "Tiled XML tileset format.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "Tiled JSON Tileset File (.tsj, .json)",
    description: "Tiled JSON tileset format.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "Tiled Lua File (.lua)",
    description: "Tiled Lua tileset format.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "Unity (.asset)",
    description: "Unity tileset asset target.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "Godot (.tres)",
    description: "Godot tileset resource format.",
    supportedNow: false,
  },
  {
    assetType: "tileset",
    label: "RPG Maker",
    description: "RPG Maker tileset target.",
    supportedNow: false,
  },
];

const assetTabs: ImportExportAssetType[] = ["project", "map", "tileset"];

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

export function ImportExportDialog({
  open,
  onOpenChange,
  mode,
  projectAction,
  mapAction,
  tilesetAction,
}: ImportExportDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportExportAssetType>("project");
  const modeCopy = getModeCopy(mode);
  const ModeIcon = modeCopy.icon;

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

            return (
              <TabsContent
                key={assetType}
                value={assetType}
                className="min-h-0 flex-1 overflow-hidden"
              >
                <ScrollArea className="h-full min-h-0">
                  <div className="space-y-3 px-6 py-5">
                    {assetOptions.map((option) => {
                      const isEnabled =
                        option.supportedNow &&
                        action.enabled &&
                        Boolean(action.onSelect);
                      const statusLabel = option.supportedNow
                        ? isEnabled
                          ? mode === "import"
                            ? "Import now"
                            : "Export now"
                          : (action.disabledReason ?? "Unavailable")
                        : "Coming Soon";

                      return (
                        <button
                          key={option.label}
                          type="button"
                          disabled={!isEnabled}
                          onClick={() => {
                            if (!isEnabled) return;
                            action.onSelect?.();
                            onOpenChange(false);
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
