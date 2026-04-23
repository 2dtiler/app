import { useState, useEffect, useCallback } from "react";
import { Loader2, RotateCcw, KeyRound } from "lucide-react";
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

import type {
  AssetType,
  StyleStack,
  TilesetConfig,
  SpriteConfig,
  BackgroundConfig,
  IconConfig,
  UIConfig,
  VFXConfig,
  ImageState,
  Ratio,
} from "@/types/integrations/ai-assets";
import {
  MODELS,
  PROVIDER_LABELS,
  ALL_RATIOS,
  COUNT_OPTIONS,
  ASSET_TYPE_DEFS,
  ART_STYLES,
  COLOR_PALETTES,
  SPRITE_SIZES,
} from "../lib/constants";
import { buildPrompt } from "../lib/prompt-builder";
import {
  TilesetConfigForm,
  SpriteConfigForm,
  BackgroundConfigForm,
  IconConfigForm,
  UIConfigForm,
  VFXConfigForm,
} from "./ConfigForms";
import { ImageUpload } from "./ImageUpload";
import { parseDataUrl } from "../lib/image-utils";
import { ImageCell } from "./ImageCell";
import { loadApiKey, loadAllApiKeys } from "@/config/api-keys";

async function generateOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  count: number,
  size: string,
  initImageB64: string | null,
  initImageMime: string | null,
): Promise<string[]> {
  if (initImageB64 && initImageMime) {
    const results: string[] = [];
    await Promise.all(
      Array.from({ length: count }, async () => {
        const form = new FormData();
        const byteStr = atob(initImageB64);
        const bytes = new Uint8Array(byteStr.length);
        for (let index = 0; index < byteStr.length; index += 1) {
          bytes[index] = byteStr.charCodeAt(index);
        }
        const blob = new Blob([bytes], { type: initImageMime });
        form.append("image", blob, "reference.png");
        form.append("prompt", prompt);
        form.append("model", model);
        form.append("n", "1");
        form.append("response_format", "b64_json");
        const response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(
            (error as { error?: { message?: string } }).error?.message ??
              `OpenAI error ${response.status}`,
          );
        }
        const data = (await response.json()) as {
          data: { b64_json: string }[];
        };
        for (const image of data.data) {
          results.push(`data:image/png;base64,${image.b64_json}`);
        }
      }),
    );
    return results;
  }

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: count,
    size,
    response_format: "b64_json",
  };
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ??
        `OpenAI error ${response.status}`,
    );
  }
  const data = (await response.json()) as { data: { b64_json: string }[] };
  return data.data.map((image) => `data:image/png;base64,${image.b64_json}`);
}

async function generateGemini(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  initImageB64: string | null,
  initImageMime: string | null,
): Promise<string> {
  const parts: unknown[] = [];
  if (initImageB64 && initImageMime) {
    parts.push({
      inline_data: { mime_type: initImageMime, data: initImageB64 },
    });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio },
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ??
        `Gemini error ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: {
      content?: {
        parts?: {
          inlineData?: { data: string; mimeType: string };
          thought?: boolean;
        }[];
      };
    }[];
  };

  const imagePart = data.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData && !part.thought);

  if (!imagePart?.inlineData) {
    throw new Error("Gemini returned no image");
  }
  const { data: b64, mimeType } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

async function generateTogether(
  apiKey: string,
  model: string,
  prompt: string,
  count: number,
  width: number,
  height: number,
): Promise<string[]> {
  const body = {
    model,
    prompt,
    n: count,
    width,
    height,
    response_format: "base64",
  };
  const response = await fetch(
    "https://api.together.xyz/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ??
        `Together AI error ${response.status}`,
    );
  }
  const data = (await response.json()) as {
    data: { b64_json?: string; url?: string }[];
  };
  return data.data.map((image) =>
    image.b64_json
      ? `data:image/jpeg;base64,${image.b64_json}`
      : (image.url ?? ""),
  );
}

async function generateXAI(
  apiKey: string,
  model: string,
  prompt: string,
  count: number,
): Promise<string[]> {
  const body = { model, prompt, n: count };
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ??
        `xAI error ${response.status}`,
    );
  }
  const data = (await response.json()) as { data: { url: string }[] };
  return data.data.map((image) => image.url);
}

export function Generator() {
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

  const refreshModels = useCallback(async () => {
    const keys = await loadAllApiKeys();
    const filtered = MODELS.filter((model) => keys[model.provider] !== null);
    setAvailableModels(filtered);
    setSelectedId((previousId) => {
      const stillAvailable = filtered.find((model) => model.id === previousId);
      return stillAvailable ? previousId : (filtered[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    void refreshModels();
    const handler = () => void refreshModels();
    window.addEventListener("ai-keys-changed", handler);
    return () => window.removeEventListener("ai-keys-changed", handler);
  }, [refreshModels]);

  const selectedModel =
    availableModels.find((model) => model.id === selectedId) ??
    availableModels[0] ??
    null;

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
      tilesetCfg,
      spriteCfg,
      bgCfg,
      iconCfg,
      uiCfg,
      vfxCfg,
      styleStack,
      transparent,
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

  const canGenerate =
    !isGenerating && !!selectedModel && generatedPrompt.trim().length > 0;

  const generate = async () => {
    if (!canGenerate || !selectedModel) return;

    const finalPrompt = generatedPrompt.trim();
    let initImgB64: string | null = null;
    let initImgMime: string | null = null;

    if (initImage && selectedModel.supportsImg2Img) {
      const parsed = parseDataUrl(initImage);
      initImgB64 = parsed.b64;
      initImgMime = parsed.mime;
    }

    const apiKey = await loadApiKey(selectedModel.provider);
    if (!apiKey) {
      toast.error(
        `No API key found for ${PROVIDER_LABELS[selectedModel.provider] ?? selectedModel.provider}. Add one in Settings.`,
      );
      return;
    }

    console.log("[AiAssets] Prompt:", finalPrompt);

    setIsGenerating(true);
    setImages(
      Array.from({ length: count }, () => ({ status: "loading" as const })),
    );

    const results = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        try {
          let urls: string[];

          switch (selectedModel.provider) {
            case "openai": {
              const size = `${effectiveRatio.w}x${effectiveRatio.h}`;
              urls = await generateOpenAI(
                apiKey,
                selectedModel.apiModel,
                finalPrompt,
                1,
                size,
                initImgB64,
                initImgMime,
              );
              break;
            }
            case "gemini": {
              const url = await generateGemini(
                apiKey,
                selectedModel.apiModel,
                finalPrompt,
                effectiveRatio.value,
                initImgB64,
                initImgMime,
              );
              urls = [url];
              break;
            }
            case "together": {
              if (index === 0) {
                urls = await generateTogether(
                  apiKey,
                  selectedModel.apiModel,
                  finalPrompt,
                  count,
                  effectiveRatio.w,
                  effectiveRatio.h,
                );
              } else {
                return null;
              }
              break;
            }
            case "xai": {
              if (index === 0) {
                urls = await generateXAI(
                  apiKey,
                  selectedModel.apiModel,
                  finalPrompt,
                  count,
                );
              } else {
                return null;
              }
              break;
            }
            default:
              throw new Error(`Unknown provider: ${selectedModel.provider}`);
          }

          return { index, urls };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error occurred.";
          const isAuthError =
            message.includes("401") ||
            message.includes("403") ||
            message.toLowerCase().includes("invalid") ||
            message.toLowerCase().includes("api key");
          if (isAuthError) {
            toast.error(
              `Invalid API key for ${PROVIDER_LABELS[selectedModel.provider] ?? selectedModel.provider}`,
            );
          }
          return { index, error: message };
        }
      }),
    );

    setImages((previous) => {
      const next = [...previous];
      for (const result of results) {
        if (!result) continue;
        if ("error" in result) {
          next[result.index] = {
            status: "error",
            message: result.error ?? "Unknown error occurred.",
          };
          continue;
        }
        for (const [offset, url] of result.urls.entries()) {
          next[result.index + offset] = { status: "done", url };
        }
      }
      return next;
    });

    setIsGenerating(false);
  };

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
                  value={effectiveRatio.value}
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
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
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

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {Array.from({ length: count }, (_, index) => (
                <ImageCell
                  key={`${index}-${images[index]?.status ?? "idle"}`}
                  index={index}
                  state={images[index] ?? { status: "idle" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
