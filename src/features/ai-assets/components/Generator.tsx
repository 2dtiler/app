import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, KeyRound, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { loadApiKey, loadAllApiKeys } from "@/config/api-keys";
import { useEditorStore } from "@/hooks/use-editor-store";
import { saveBlobFile } from "@/services/file-system";
import { generateWithProvider } from "@/features/ai-assets/lib/providers";
import { UNKNOWN_QUOTA } from "@/features/ai-assets/lib/quota";
import { arrayBufferToDataUrl } from "@/features/ai-assets/lib/provider-utils";
import {
  createAiImageRecord,
  deleteAiImageRecord,
  listAiImageHistory,
  listSavedAiImages,
  saveAiImageRecord,
  setAiImageSaved,
} from "@/features/ai-assets/lib/persistence";
import {
  appendGeneratedImageTileset,
  createGeneratedTilesetId,
  saveGeneratedImageAsset,
} from "@/features/ai-assets/lib/tileset-actions";
import { setStandaloneAiImageEditorContext } from "@/features/ai-assets/lib/standalone-editor-context";
import { buildPrompt } from "../lib/prompt-builder";
import {
  getAiAssetTargetDimensions,
  getClosestAiAssetRatio,
} from "../lib/dimensions";
import {
  ALL_RATIOS,
  ART_STYLES,
  ASSET_TYPE_DEFS,
  COLOR_PALETTES,
  COUNT_OPTIONS,
  MODELS,
  PROVIDER_LABELS,
  SPRITE_SIZES,
} from "../lib/constants";
import { parseDataUrl } from "../lib/image-utils";
import {
  BackgroundConfigForm,
  IconConfigForm,
  SpriteConfigForm,
  TilesetConfigForm,
  UIConfigForm,
  VFXConfigForm,
} from "./ConfigForms";
import { ImageCell } from "./ImageCell";
import { ImageUpload } from "./ImageUpload";
import type {
  AiGeneratedImageRecord,
  AiQuotaState,
  AiSchedulerState,
  AssetType,
  BackgroundConfig,
  IconConfig,
  ImageState,
  Ratio,
  SpriteConfig,
  StyleStack,
  TilesetConfig,
  UIConfig,
  VFXConfig,
} from "@/types/integrations/ai-assets";
import type {
  AiImageActionHandlers,
  AiRecordsGridProps,
} from "@/features/ai-assets/types";

function createRecordId(): string {
  return crypto.randomUUID();
}

function getQuotaPercent(quota: AiQuotaState): number | null {
  if (
    quota.limit === null ||
    quota.remaining === null ||
    quota.limit <= 0 ||
    quota.remaining < 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(100, (quota.remaining / quota.limit) * 100));
}

function getRecordFilename(record: AiGeneratedImageRecord): string {
  const extension = record.mimeType.includes("jpeg")
    ? "jpg"
    : record.mimeType.includes("webp")
      ? "webp"
      : "png";
  return `ai-${record.provider}-${record.createdAt}.${extension}`;
}

function RecordsGrid({
  records,
  urls,
  actions,
  emptyLabel,
}: AiRecordsGridProps) {
  if (records.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      {records.map((record, index) => (
        <ImageCell
          key={record.id}
          index={index}
          record={record}
          url={urls[record.id] ?? null}
          actions={actions}
        />
      ))}
    </div>
  );
}

export function Generator() {
  const { setState } = useEditorStore();
  const [assetType, setAssetType] = useState<AssetType>("tileset");
  const [tilesetCfg, setTilesetCfg] = useState<TilesetConfig>({
    tileType: "Ground",
    terrain: "Grass",
    transition: "None",
    maskMode: "seamless 47-tile blob",
    perspective: "Top-down",
    seamless: true,
  });
  const [spriteCfg, setSpriteCfg] = useState<SpriteConfig>({
    role: "Hero / Player",
    animState: "idle",
    perspective: "side-view",
    direction: "South",
    frameCount: "4",
    proportion: "semi-realistic",
  });
  const [bgCfg, setBgCfg] = useState<BackgroundConfig>({
    layer: "midground",
    environment: "Forest",
    mood: "Day",
    seamless: true,
  });
  const [iconCfg, setIconCfg] = useState<IconConfig>({
    category: "Consumable",
    type: "Health Potion",
    rarity: "Common",
  });
  const [uiCfg, setUiCfg] = useState<UIConfig>({
    elementType: "Button",
    theme: "Fantasy",
    nineSlice: false,
  });
  const [vfxCfg, setVfxCfg] = useState<VFXConfig>({
    action: "Explosion",
    frameCount: "8",
    size: "64x64",
  });
  const [styleStack, setStyleStack] = useState<StyleStack>({
    artStyle: "pixel art",
    colorPalette: "vibrant",
    spriteSize: "32x32",
  });
  const [transparent, setTransparent] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isPromptEdited, setIsPromptEdited] = useState(false);
  const [availableModels, setAvailableModels] = useState(MODELS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState(2);
  const [images, setImages] = useState<ImageState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initImage, setInitImage] = useState<string | null>(null);
  const [history, setHistory] = useState<AiGeneratedImageRecord[]>([]);
  const [gallery, setGallery] = useState<AiGeneratedImageRecord[]>([]);
  const [currentRecords, setCurrentRecords] = useState<AiGeneratedImageRecord[]>(
    [],
  );
  const [recordUrls, setRecordUrls] = useState<Record<string, string>>({});
  const [quota, setQuota] = useState<AiQuotaState>(UNKNOWN_QUOTA);
  const [scheduler, setScheduler] = useState<AiSchedulerState>({
    intervalSeconds: 60,
    running: false,
    nextRunAt: null,
  });
  const [now, setNow] = useState(Date.now());
  const isGeneratingRef = useRef(false);

  const refreshModels = useCallback(async () => {
    const keys = await loadAllApiKeys();
    const filtered = MODELS.filter((model) => keys[model.provider] !== null);
    setAvailableModels(filtered);
    setSelectedId((previousId) => {
      const stillAvailable = filtered.find((model) => model.id === previousId);
      return stillAvailable ? previousId : (filtered[0]?.id ?? null);
    });
  }, []);

  const refreshRecords = useCallback(async () => {
    const [nextHistory, nextGallery] = await Promise.all([
      listAiImageHistory(),
      listSavedAiImages(),
    ]);
    setHistory(nextHistory);
    setGallery(nextGallery);
  }, []);

  useEffect(() => {
    void refreshModels();
    void refreshRecords();
    const handler = () => void refreshModels();
    window.addEventListener("ai-keys-changed", handler);
    return () => window.removeEventListener("ai-keys-changed", handler);
  }, [refreshModels, refreshRecords]);

  useEffect(() => {
    const nextUrls: Record<string, string> = {};
    for (const record of history) {
      nextUrls[record.id] = URL.createObjectURL(
        new Blob([record.data], { type: record.mimeType }),
      );
    }
    setRecordUrls((previous) => {
      for (const url of Object.values(previous)) {
        URL.revokeObjectURL(url);
      }
      return nextUrls;
    });
    return () => {
      for (const url of Object.values(nextUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [history]);

  const selectedModel =
    availableModels.find((model) => model.id === selectedId) ??
    availableModels[0] ??
    null;
  const isHuggingFaceSelected = selectedModel?.provider === "huggingface";

  const autoPrompt = useCallback(
    () =>
      buildPrompt(
        assetType,
        tilesetCfg,
        spriteCfg,
        bgCfg,
        iconCfg,
        uiCfg,
        vfxCfg,
        styleStack,
        transparent,
      ),
    [
      assetType,
      bgCfg,
      iconCfg,
      spriteCfg,
      styleStack,
      tilesetCfg,
      transparent,
      uiCfg,
      vfxCfg,
    ],
  );

  useEffect(() => {
    if (!isPromptEdited) {
      setGeneratedPrompt(autoPrompt());
    }
  }, [autoPrompt, isPromptEdited]);

  const resetPrompt = () => {
    setIsPromptEdited(false);
    setGeneratedPrompt(autoPrompt());
  };

  const availableRatios =
    selectedModel?.supportedRatios !== undefined
      ? ALL_RATIOS.filter((ratio) =>
          (selectedModel.supportedRatios as Ratio[]).includes(ratio.value),
        )
      : ALL_RATIOS;
  const effectiveRatio =
    availableRatios.find((ratio) => ratio.value === "1:1") ??
    availableRatios[0] ??
    ALL_RATIOS[0];
  const targetDimensions = useMemo(
    () =>
      getAiAssetTargetDimensions({
        assetType,
        style: styleStack,
        tileset: tilesetCfg,
        sprite: spriteCfg,
        vfx: vfxCfg,
      }),
    [
      assetType,
      spriteCfg,
      styleStack,
      tilesetCfg,
      vfxCfg,
    ],
  );
  const generationRatio =
    (targetDimensions
      ? getClosestAiAssetRatio(targetDimensions, availableRatios)
      : null) ?? effectiveRatio;
  const generationWidth = targetDimensions?.width ?? effectiveRatio.w;
  const generationHeight = targetDimensions?.height ?? effectiveRatio.h;
  const canGenerate =
    !isGenerating && !!selectedModel && generatedPrompt.trim().length > 0;

  const generate = useCallback(
    async (source: "manual" | "scheduler" = "manual") => {
      if (!canGenerate || !selectedModel || isGeneratingRef.current) {
        return false;
      }

      const finalPrompt = generatedPrompt.trim();
      const apiKey = await loadApiKey(selectedModel.provider);
      if (!apiKey) {
        toast.error(
          `No API key found for ${PROVIDER_LABELS[selectedModel.provider] ?? selectedModel.provider}. Add one in Settings.`,
        );
        return false;
      }

      let initImgB64: string | null = null;
      let initImgMime: string | null = null;
      if (initImage && selectedModel.supportsImg2Img) {
        const parsed = parseDataUrl(initImage);
        initImgB64 = parsed.b64;
        initImgMime = parsed.mime;
      }

      isGeneratingRef.current = true;
      setIsGenerating(true);
      setImages(
        Array.from({ length: count }, () => ({ status: "loading" as const })),
      );

      try {
        const result = await generateWithProvider(selectedModel.provider, {
          apiKey,
          model: selectedModel.apiModel,
          prompt: finalPrompt,
          count,
          width: generationWidth,
          height: generationHeight,
          ratio: generationRatio.value,
          initImageB64: initImgB64,
          initImageMime: initImgMime,
        });
        setQuota(result.quota);

        const records = result.images.map((image) =>
          createAiImageRecord(
            {
              ...image,
              prompt: finalPrompt,
              provider: selectedModel.provider,
              modelId: selectedModel.apiModel,
              modelLabel: selectedModel.label,
            },
            createRecordId(),
          ),
        );
        await Promise.all(records.map(saveAiImageRecord));
        setCurrentRecords(records);
        setImages(
          records.map((record) => ({
            status: "done" as const,
            url: arrayBufferToDataUrl(record.data, record.mimeType),
            recordId: record.id,
          })),
        );
        await refreshRecords();
        if (source === "scheduler") {
          toast.success("Scheduled image generated");
        }
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred.";
        setImages([{ status: "error", message }]);
        const lowerMessage = message.toLowerCase();
        if (
          isHuggingFaceSelected &&
          (message.includes("401") ||
            message.includes("403") ||
            message.includes("429") ||
            lowerMessage.includes("token") ||
            lowerMessage.includes("rate") ||
            lowerMessage.includes("quota"))
        ) {
          setScheduler((previous) => ({
            ...previous,
            running: false,
            nextRunAt: null,
          }));
        }
        toast.error(message);
        return false;
      } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [
      canGenerate,
      count,
      generationHeight,
      generationRatio.value,
      generationWidth,
      generatedPrompt,
      initImage,
      isHuggingFaceSelected,
      refreshRecords,
      selectedModel,
    ],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scheduler.running || !isHuggingFaceSelected) return;
    if (!scheduler.nextRunAt) {
      setScheduler((previous) => ({
        ...previous,
        nextRunAt: Date.now() + previous.intervalSeconds * 1000,
      }));
      return;
    }
    if (now < scheduler.nextRunAt || isGeneratingRef.current) return;

    void generate("scheduler").then((didGenerate) => {
      if (!didGenerate) return;
      setScheduler((previous) => ({
        ...previous,
        nextRunAt: Date.now() + previous.intervalSeconds * 1000,
      }));
    });
  }, [
    generate,
    isHuggingFaceSelected,
    now,
    scheduler.nextRunAt,
    scheduler.running,
  ]);

  useEffect(() => {
    if (!isHuggingFaceSelected && scheduler.running) {
      setScheduler((previous) => ({
        ...previous,
        running: false,
        nextRunAt: null,
      }));
    }
  }, [isHuggingFaceSelected, scheduler.running]);

  const actions = useMemo<AiImageActionHandlers>(
    () => ({
      onDownload(record) {
        void saveBlobFile(
          new Blob([record.data], { type: record.mimeType }),
          getRecordFilename(record),
        );
      },
      onToggleSaved(record) {
        void setAiImageSaved(record.id, record.savedAt === null).then(
          refreshRecords,
        );
      },
      async onAddToTileset(record) {
        try {
          const assetId = await saveGeneratedImageAsset(record);
          const tilesetId = createGeneratedTilesetId();
          let added = false;
          setState((draft) => {
            added = appendGeneratedImageTileset(
              draft,
              record,
              assetId,
              tilesetId,
            );
          });
          if (added) {
            toast.success("Added generated image as a tileset");
          } else {
            toast.error("Create or open a project with a tileset group first.");
          }
        } catch {
          toast.error("Failed to add generated image to tileset");
        }
      },
      onOpenInEditor(record) {
        setStandaloneAiImageEditorContext({
          id: record.id,
          data: record.data,
          mimeType: record.mimeType,
          width: record.width,
          height: record.height,
          name: getRecordFilename(record),
        });
        window.dispatchEvent(new CustomEvent("open-image-editor"));
      },
      onDelete(record) {
        void deleteAiImageRecord(record.id).then(async () => {
          setCurrentRecords((previous) =>
            previous.filter((candidate) => candidate.id !== record.id),
          );
          await refreshRecords();
        });
      },
    }),
    [refreshRecords, setState],
  );

  const quotaPercent = getQuotaPercent(quota);
  const secondsUntilNext =
    scheduler.nextRunAt !== null
      ? Math.max(0, Math.ceil((scheduler.nextRunAt - now) / 1000))
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Generate AI Assets</h3>
            <p className="text-xs text-muted-foreground">
              Create tilesets, sprites, UI, and effects from a structured
              prompt.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetPrompt}
            disabled={isGenerating}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset Prompt
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-r">
          <div className="space-y-5 p-4">
            <section className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-type">Asset Type</Label>
                <Select
                  value={assetType}
                  onValueChange={(value) => setAssetType(value as AssetType)}
                >
                  <SelectTrigger
                    id="ai-assets-type"
                    name="ai-assets-type"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Asset Types</SelectLabel>
                      {ASSET_TYPE_DEFS.map((asset) => (
                        <SelectItem key={asset.value} value={asset.value}>
                          {asset.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {assetType === "tileset" && (
                <TilesetConfigForm
                  config={tilesetCfg}
                  onChange={setTilesetCfg}
                />
              )}
              {assetType === "sprite" && (
                <SpriteConfigForm config={spriteCfg} onChange={setSpriteCfg} />
              )}
              {assetType === "background" && (
                <BackgroundConfigForm config={bgCfg} onChange={setBgCfg} />
              )}
              {assetType === "icon" && (
                <IconConfigForm config={iconCfg} onChange={setIconCfg} />
              )}
              {assetType === "ui" && (
                <UIConfigForm config={uiCfg} onChange={setUiCfg} />
              )}
              {assetType === "vfx" && (
                <VFXConfigForm config={vfxCfg} onChange={setVfxCfg} />
              )}
            </section>

            <section className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-style">Art Style</Label>
                <Select
                  value={styleStack.artStyle}
                  onValueChange={(value) =>
                    setStyleStack((previous) => ({
                      ...previous,
                      artStyle: value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="ai-assets-style"
                    name="ai-assets-style"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ART_STYLES.map((style) => (
                      <SelectItem key={style.value} value={style.value}>
                        {style.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-palette">Color Palette</Label>
                <Select
                  value={styleStack.colorPalette}
                  onValueChange={(value) =>
                    setStyleStack((previous) => ({
                      ...previous,
                      colorPalette: value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="ai-assets-palette"
                    name="ai-assets-palette"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_PALETTES.map((palette) => (
                      <SelectItem key={palette.value} value={palette.value}>
                        {palette.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-sprite-size">Sprite Size</Label>
                <Select
                  value={styleStack.spriteSize}
                  onValueChange={(value) =>
                    setStyleStack((previous) => ({
                      ...previous,
                      spriteSize: value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="ai-assets-sprite-size"
                    name="ai-assets-sprite-size"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPRITE_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="ai-assets-transparent" className="text-sm">
                  Transparent Background
                </Label>
                <Switch
                  id="ai-assets-transparent"
                  name="ai-assets-transparent"
                  checked={transparent}
                  onCheckedChange={setTransparent}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border p-3">
              <ImageUpload
                id="ai-assets-reference-image"
                name="ai-assets-reference-image"
                label="Reference Image"
                value={initImage}
                onChange={setInitImage}
              />

              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-model">Model</Label>
                <Select value={selectedId ?? ""} onValueChange={setSelectedId}>
                  <SelectTrigger
                    id="ai-assets-model"
                    name="ai-assets-model"
                    className="w-full"
                  >
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-count">Count</Label>
                <Select
                  value={String(count)}
                  onValueChange={(value) => setCount(Number(value))}
                >
                  <SelectTrigger
                    id="ai-assets-count"
                    name="ai-assets-count"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNT_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-assets-ratio">Aspect Ratio</Label>
                <Select
                  value={generationRatio.value}
                  onValueChange={() => undefined}
                >
                  <SelectTrigger
                    id="ai-assets-ratio"
                    name="ai-assets-ratio"
                    className="w-full"
                    disabled
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRatios.map((ratio) => (
                      <SelectItem key={ratio.value} value={ratio.value}>
                        {ratio.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ai-assets-prompt">Prompt</Label>
                {isPromptEdited && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Custom
                  </span>
                )}
              </div>
              <textarea
                id="ai-assets-prompt"
                name="ai-assets-prompt"
                className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                value={generatedPrompt}
                onChange={(event) => {
                  setIsPromptEdited(true);
                  setGeneratedPrompt(event.target.value);
                }}
                placeholder="Describe the asset you want to generate"
              />
            </section>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <div className="space-y-4 p-4">
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    {selectedModel ? selectedModel.label : "No model available"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedModel
                      ? "Models are filtered to providers with configured API keys."
                      : "Add an API key in Settings to enable generation."}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void generate()}
                  disabled={!canGenerate}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating
                    </>
                  ) : (
                    "Generate"
                  )}
                </Button>
              </div>

              {isHuggingFaceSelected && (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">Hugging Face quota</span>
                    <span className="text-muted-foreground">
                      {quota.remaining !== null && quota.limit !== null
                        ? `${quota.remaining} / ${quota.limit}`
                        : "Unknown"}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Hugging Face remaining quota"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={quotaPercent ?? undefined}
                  >
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${quotaPercent ?? 100}%` }}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-assets-scheduler-interval">
                        Scheduler Interval
                      </Label>
                      <input
                        id="ai-assets-scheduler-interval"
                        name="ai-assets-scheduler-interval"
                        type="number"
                        min={10}
                        max={86400}
                        value={scheduler.intervalSeconds}
                        onChange={(event) =>
                          setScheduler((previous) => ({
                            ...previous,
                            intervalSeconds: Math.max(
                              10,
                              Number(event.target.value) || 10,
                            ),
                          }))
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant={scheduler.running ? "secondary" : "outline"}
                      className="self-end"
                      disabled={!canGenerate && !scheduler.running}
                      onClick={() =>
                        setScheduler((previous) => ({
                          ...previous,
                          running: !previous.running,
                          nextRunAt: !previous.running
                            ? Date.now() + previous.intervalSeconds * 1000
                            : null,
                        }))
                      }
                    >
                      {scheduler.running ? (
                        <>
                          <Square className="mr-2 h-3.5 w-3.5" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-3.5 w-3.5" />
                          Start
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {scheduler.running && secondsUntilNext !== null
                      ? `Next generation in ${secondsUntilNext}s`
                      : "Scheduler paused"}
                  </div>
                </div>
              )}
            </div>

            <Tabs defaultValue="current" className="min-h-0">
              <TabsList variant="line" className="w-full justify-start">
                <TabsTrigger value="current">Current</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="gallery">Gallery</TabsTrigger>
              </TabsList>

              <TabsContent value="current" className="pt-3">
                {isGenerating ? (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {Array.from({ length: count }, (_, index) => (
                      <ImageCell
                        key={`loading-${index}`}
                        index={index}
                        state={images[index] ?? { status: "loading" }}
                      />
                    ))}
                  </div>
                ) : currentRecords.length > 0 ? (
                  <RecordsGrid
                    records={currentRecords}
                    urls={recordUrls}
                    actions={actions}
                    emptyLabel="No current images"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {Array.from({ length: count }, (_, index) => (
                      <ImageCell
                        key={`idle-${index}`}
                        index={index}
                        state={images[index] ?? { status: "idle" }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="pt-3">
                <RecordsGrid
                  records={history}
                  urls={recordUrls}
                  actions={actions}
                  emptyLabel="Generated images will appear here."
                />
              </TabsContent>

              <TabsContent value="gallery" className="pt-3">
                <RecordsGrid
                  records={gallery}
                  urls={recordUrls}
                  actions={actions}
                  emptyLabel="Saved images will appear here."
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
