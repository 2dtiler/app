import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { RasterExportOptionsPanel } from "./import-export/RasterExportOptionsPanel";
import { TiledMapExportOptionsPanel } from "./import-export/TiledMapExportOptionsPanel";
import { TiledTilesetExportOptionsPanel } from "./import-export/TiledTilesetExportOptionsPanel";
import { GodotMapExportOptionsPanel } from "./import-export/GodotMapExportOptionsPanel";
import { GameMakerMapExportOptionsPanel } from "./import-export/GameMakerMapExportOptionsPanel";
import { DefoldMapExportOptionsPanel } from "./import-export/DefoldMapExportOptionsPanel";
import {
  isDefoldMapExportOptions,
  isGameMakerMapExportOptions,
  isGodotMapExportOptions,
  isRasterExportOptions,
  isTiledMapExportOptions,
  isTiledTilesetExportOptions,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  isDefoldMapExportOption,
  isExpandableExportOption,
  isGameMakerMapExportOption,
  isGodotMapExportOption,
  isRasterImageOption,
  isTiledMapOption,
  isTiledTilesetOption,
} from "@/features/import-export/lib/import-export-options";
import { DEFAULT_GODOT_MAP_EXPORT_OPTIONS } from "@/features/import-export/lib/godot-scene-utils";
import { DEFAULT_RASTER_EXPORT_OPTIONS } from "@/features/import-export/lib/import-export-raster";
import type {
  DefoldMapExportOptions,
  GameMakerMapExportOptions,
  GodotMapExportOptions,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  ImportExportRasterExportOptions,
  QuickExportSetupDialogProps,
  TiledMapExportOptions,
  TiledTilesetExportOptions,
} from "@/types";

function createInitialRasterExportOptions(
  initialFormatExportOptions?: ImportExportFormatExportOptions,
): ImportExportRasterExportOptions {
  if (isRasterExportOptions(initialFormatExportOptions)) {
    return { ...initialFormatExportOptions };
  }

  return { ...DEFAULT_RASTER_EXPORT_OPTIONS };
}

function createInitialTiledMapExportOptions(
  initialFormatExportOptions?: ImportExportFormatExportOptions,
): TiledMapExportOptions {
  if (isTiledMapExportOptions(initialFormatExportOptions)) {
    return { ...initialFormatExportOptions };
  }

  return {
    format: "xml",
    encoding: "base64",
    compression: "zlib",
    compressionLevel: 6,
    tilesetMode: "external",
    renderOrder: "right-down",
  };
}

function createInitialTiledTilesetExportOptions(
  initialFormatExportOptions?: ImportExportFormatExportOptions,
): TiledTilesetExportOptions {
  if (isTiledTilesetExportOptions(initialFormatExportOptions)) {
    return { ...initialFormatExportOptions };
  }

  return {
    format: "xml",
  };
}

function createInitialGodotMapExportOptions(
  initialFormatExportOptions?: ImportExportFormatExportOptions,
): GodotMapExportOptions {
  if (isGodotMapExportOptions(initialFormatExportOptions)) {
    return { ...initialFormatExportOptions };
  }

  return { ...DEFAULT_GODOT_MAP_EXPORT_OPTIONS };
}

function createInitialGameMakerMapExportOptions(
  initialFormatExportOptions?: ImportExportFormatExportOptions,
): GameMakerMapExportOptions {
  if (isGameMakerMapExportOptions(initialFormatExportOptions)) {
    return { ...initialFormatExportOptions };
  }

  return {
    format: "yy",
  };
}

function createInitialDefoldMapExportOptions(
  initialFormatExportOptions?: ImportExportFormatExportOptions,
): DefoldMapExportOptions {
  if (isDefoldMapExportOptions(initialFormatExportOptions)) {
    return { ...initialFormatExportOptions };
  }

  return {
    format: "collection",
  };
}

function getDialogDescription(optionId: ImportExportOptionId | null) {
  if (!optionId) {
    return "Choose an export format for quick export. The selected format will be reused for this asset on future exports.";
  }

  if (isExpandableExportOption(optionId)) {
    return "Choose the export format and configure any required export settings. Those settings will be reused for this asset next time.";
  }

  return "Choose the export format to reuse for this asset. The export will run immediately after you confirm.";
}

function getSelectedFormatExportOptions(
  optionId: ImportExportOptionId | null,
  rasterExportOptions: ImportExportRasterExportOptions,
  tiledMapExportOptions: TiledMapExportOptions,
  tiledTilesetExportOptions: TiledTilesetExportOptions,
  godotMapExportOptions: GodotMapExportOptions,
  gameMakerMapExportOptions: GameMakerMapExportOptions,
  defoldMapExportOptions: DefoldMapExportOptions,
): ImportExportFormatExportOptions | undefined {
  if (!optionId) {
    return undefined;
  }

  if (isRasterImageOption(optionId)) {
    return rasterExportOptions;
  }

  if (isTiledMapOption(optionId)) {
    return tiledMapExportOptions;
  }

  if (isTiledTilesetOption(optionId)) {
    return tiledTilesetExportOptions;
  }

  if (isGodotMapExportOption(optionId)) {
    return godotMapExportOptions;
  }

  if (isGameMakerMapExportOption(optionId)) {
    return gameMakerMapExportOptions;
  }

  if (isDefoldMapExportOption(optionId)) {
    return defoldMapExportOptions;
  }

  return undefined;
}

export function QuickExportSetupDialog({
  open,
  assetType,
  assetLabel,
  initialOptionId,
  initialFormatExportOptions,
  isSubmitting,
  optionSummaries,
  supportsRenderOrder,
  onOpenChange,
  onSubmit,
}: QuickExportSetupDialogProps) {
  const [selectedOptionId, setSelectedOptionId] =
    useState<ImportExportOptionId | null>(initialOptionId);
  const [rasterExportOptions, setRasterExportOptions] = useState(
    createInitialRasterExportOptions(initialFormatExportOptions),
  );
  const [tiledMapExportOptions, setTiledMapExportOptions] = useState(
    createInitialTiledMapExportOptions(initialFormatExportOptions),
  );
  const [tiledTilesetExportOptions, setTiledTilesetExportOptions] = useState(
    createInitialTiledTilesetExportOptions(initialFormatExportOptions),
  );
  const [godotMapExportOptions, setGodotMapExportOptions] = useState(
    createInitialGodotMapExportOptions(initialFormatExportOptions),
  );
  const [gameMakerMapExportOptions, setGameMakerMapExportOptions] = useState(
    createInitialGameMakerMapExportOptions(initialFormatExportOptions),
  );
  const [defoldMapExportOptions, setDefoldMapExportOptions] = useState(
    createInitialDefoldMapExportOptions(initialFormatExportOptions),
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedOptionId(initialOptionId ?? optionSummaries[0]?.id ?? null);
    setRasterExportOptions(
      createInitialRasterExportOptions(initialFormatExportOptions),
    );
    setTiledMapExportOptions(
      createInitialTiledMapExportOptions(initialFormatExportOptions),
    );
    setTiledTilesetExportOptions(
      createInitialTiledTilesetExportOptions(initialFormatExportOptions),
    );
    setGodotMapExportOptions(
      createInitialGodotMapExportOptions(initialFormatExportOptions),
    );
    setGameMakerMapExportOptions(
      createInitialGameMakerMapExportOptions(initialFormatExportOptions),
    );
    setDefoldMapExportOptions(
      createInitialDefoldMapExportOptions(initialFormatExportOptions),
    );
  }, [initialFormatExportOptions, initialOptionId, open, optionSummaries]);

  const selectedOption = useMemo(
    () =>
      optionSummaries.find(
        (optionSummary) => optionSummary.id === selectedOptionId,
      ) ?? null,
    [optionSummaries, selectedOptionId],
  );

  async function handleSubmit(
    explicitOptions?: ImportExportFormatExportOptions,
  ) {
    if (!selectedOptionId) {
      return;
    }

    const didExport = await onSubmit(
      selectedOptionId,
      explicitOptions ??
        getSelectedFormatExportOptions(
          selectedOptionId,
          rasterExportOptions,
          tiledMapExportOptions,
          tiledTilesetExportOptions,
          godotMapExportOptions,
          gameMakerMapExportOptions,
          defoldMapExportOptions,
        ),
    );

    if (didExport) {
      onOpenChange(false);
    }
  }

  const rendersInlinePanel =
    selectedOptionId !== null && isExpandableExportOption(selectedOptionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2.5rem)] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Quick Export Setup</DialogTitle>
          <DialogDescription>
            {assetType === "map" ? "Map" : "Tileset"}: {assetLabel}
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            {getDialogDescription(selectedOptionId)}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 py-5">
          <div className="space-y-4">
            <div className="space-y-2">
              {optionSummaries.map((optionSummary) => {
                const isSelected = optionSummary.id === selectedOptionId;

                return (
                  <button
                    key={optionSummary.id}
                    id={`quick-export-option-${assetType}-${optionSummary.id}`}
                    name={`quick-export-option-${assetType}`}
                    type="button"
                    className={cn(
                      "flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/6"
                        : "border-border-visible bg-background hover:border-primary/50 hover:bg-secondary/60",
                    )}
                    onClick={() => setSelectedOptionId(optionSummary.id)}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-foreground">
                        {optionSummary.label}
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {optionSummary.description}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.08em]",
                        isSelected
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border-visible bg-background text-muted-foreground",
                      )}
                    >
                      {isSelected ? "Selected" : "Choose"}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedOption ? (
              <div className="space-y-3">
                {selectedOptionId && isRasterImageOption(selectedOptionId) ? (
                  <RasterExportOptionsPanel
                    options={rasterExportOptions}
                    disabled={isSubmitting}
                    onOptionsChange={setRasterExportOptions}
                    onExport={(options) => {
                      void handleSubmit(options);
                    }}
                  />
                ) : null}

                {selectedOptionId && isTiledMapOption(selectedOptionId) ? (
                  <TiledMapExportOptionsPanel
                    options={tiledMapExportOptions}
                    disabled={isSubmitting}
                    supportsRenderOrder={supportsRenderOrder}
                    onOptionsChange={setTiledMapExportOptions}
                    onExport={(options) => {
                      void handleSubmit(options);
                    }}
                  />
                ) : null}

                {selectedOptionId && isTiledTilesetOption(selectedOptionId) ? (
                  <TiledTilesetExportOptionsPanel
                    options={tiledTilesetExportOptions}
                    disabled={isSubmitting}
                    onOptionsChange={setTiledTilesetExportOptions}
                    onExport={(options) => {
                      void handleSubmit(options);
                    }}
                  />
                ) : null}

                {selectedOptionId &&
                isGodotMapExportOption(selectedOptionId) ? (
                  <GodotMapExportOptionsPanel
                    options={godotMapExportOptions}
                    disabled={isSubmitting}
                    onOptionsChange={setGodotMapExportOptions}
                    onExport={(options) => {
                      void handleSubmit(options);
                    }}
                  />
                ) : null}

                {selectedOptionId &&
                isGameMakerMapExportOption(selectedOptionId) ? (
                  <GameMakerMapExportOptionsPanel
                    options={gameMakerMapExportOptions}
                    disabled={isSubmitting}
                    onOptionsChange={setGameMakerMapExportOptions}
                    onExport={(options) => {
                      void handleSubmit(options);
                    }}
                  />
                ) : null}

                {selectedOptionId &&
                isDefoldMapExportOption(selectedOptionId) ? (
                  <DefoldMapExportOptionsPanel
                    options={defoldMapExportOptions}
                    disabled={isSubmitting}
                    onOptionsChange={setDefoldMapExportOptions}
                    onExport={(options) => {
                      void handleSubmit(options);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {!rendersInlinePanel ? (
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              id={`quick-export-setup-cancel-${assetType}`}
              name={`quick-export-setup-cancel-${assetType}`}
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              id={`quick-export-setup-submit-${assetType}`}
              name={`quick-export-setup-submit-${assetType}`}
              onClick={() => {
                void handleSubmit();
              }}
              disabled={isSubmitting || !selectedOptionId}
            >
              {isSubmitting ? "Exporting..." : "Save & Export"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
