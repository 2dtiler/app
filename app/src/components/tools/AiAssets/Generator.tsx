import { useState, useEffect, useCallback } from "react";
import { Loader2, RotateCcw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
} from "./types";
import {
  MODELS,
  PROVIDER_LABELS,
  ALL_RATIOS,
  COUNT_OPTIONS,
  ASSET_TYPE_DEFS,
  ART_STYLES,
  COLOR_PALETTES,
  SPRITE_SIZES,
} from "./constants";
import { buildPrompt } from "./prompt-builder";
import {
  TilesetConfigForm,
  SpriteConfigForm,
  BackgroundConfigForm,
  IconConfigForm,
  UIConfigForm,
  VFXConfigForm,
} from "./ConfigForms";
import { ImageUpload } from "./ImageUpload";
import { parseDataUrl } from "./image-utils";
import { ImageCell } from "./ImageCell";
import { loadApiKey, loadAllApiKeys } from "@/lib/api-keys";

// ---------------------------------------------------------------------------
// Per-provider image generation helpers
// ---------------------------------------------------------------------------

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
    // Use the edits endpoint (one image per request)
    const results: string[] = [];
    await Promise.all(
      Array.from({ length: count }, async () => {
        const form = new FormData();
        const byteStr = atob(initImageB64);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++)
          bytes[i] = byteStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: initImageMime });
        form.append("image", blob, "reference.png");
        form.append("prompt", prompt);
        form.append("model", model);
        form.append("n", "1");
        form.append("response_format", "b64_json");
        const res = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: { message?: string } }).error?.message ??
              `OpenAI error ${res.status}`,
          );
        }
        const data = (await res.json()) as { data: { b64_json: string }[] };
        for (const img of data.data) {
          results.push(`data:image/png;base64,${img.b64_json}`);
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
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
        `OpenAI error ${res.status}`,
    );
  }
  const data = (await res.json()) as { data: { b64_json: string }[] };
  return data.data.map((img) => `data:image/png;base64,${img.b64_json}`);
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
        `Gemini error ${res.status}`,
    );
  }

  const data = (await res.json()) as {
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
    ?.flatMap((c) => c.content?.parts ?? [])
    .find((p) => p.inlineData && !p.thought);

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
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
        `Together AI error ${res.status}`,
    );
  }
  const data = (await res.json()) as {
    data: { b64_json?: string; url?: string }[];
  };
  return data.data.map((img) =>
    img.b64_json ? `data:image/jpeg;base64,${img.b64_json}` : (img.url ?? ""),
  );
}

async function generateXAI(
  apiKey: string,
  model: string,
  prompt: string,
  count: number,
): Promise<string[]> {
  const body = { model, prompt, n: count };
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
        `xAI error ${res.status}`,
    );
  }
  const data = (await res.json()) as { data: { url: string }[] };
  return data.data.map((img) => img.url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Generator() {
  // Asset type
  const [assetType, setAssetType] = useState<AssetType>("tileset");

  // Per-asset configs
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

  // Style Stack
  const [styleStack, setStyleStack] = useState<StyleStack>({
    artStyle: "pixel art",
    colorPalette: "vibrant",
    spriteSize: "32x32",
  });
  const [transparent, setTransparent] = useState(false);

  // Prompt (auto-generated but editable)
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isPromptEdited, setIsPromptEdited] = useState(false);

  // Model + generation
  const [availableModels, setAvailableModels] = useState(MODELS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState(2);
  const [images, setImages] = useState<ImageState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initImage, setInitImage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Re-filter available models whenever keys change
  // ---------------------------------------------------------------------------
  const refreshModels = useCallback(async () => {
    const keys = await loadAllApiKeys();
    const filtered = MODELS.filter((m) => keys[m.provider] !== null);
    setAvailableModels(filtered);
    setSelectedId((prev) => {
      const stillAvailable = filtered.find((m) => m.id === prev);
      return stillAvailable ? prev : (filtered[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    void refreshModels();
    const handler = () => void refreshModels();
    window.addEventListener("ai-keys-changed", handler);
    return () => window.removeEventListener("ai-keys-changed", handler);
  }, [refreshModels]);

  const selectedModel =
    availableModels.find((m) => m.id === selectedId) ??
    availableModels[0] ??
    null;

  // ---------------------------------------------------------------------------
  // Auto-rebuild the prompt whenever config/style changes (unless user edited manually)
  // ---------------------------------------------------------------------------
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

  // Resolve effective ratio for provider size options (prefer 1:1 square)
  const availableRatios =
    selectedModel?.supportedRatios !== undefined
      ? ALL_RATIOS.filter((r) =>
          (selectedModel.supportedRatios as Ratio[]).includes(r.value),
        )
      : ALL_RATIOS;
  const effectiveRatio =
    availableRatios.find((r) => r.value === "1:1") ??
    availableRatios[0] ??
    ALL_RATIOS[0];

  const canGenerate =
    !isGenerating && !!selectedModel && generatedPrompt.trim().length > 0;

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------
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
      Array.from({ length: count }, async (_, i) => {
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
              // Batch all images in a single request from index 0
              if (i === 0) {
                urls = await generateTogether(
                  apiKey,
                  selectedModel.apiModel,
                  finalPrompt,
                  count,
                  effectiveRatio.w,
                  effectiveRatio.h,
                );
              } else {
                return null; // filled from index-0 batch result
              }
              break;
            }
            case "xai": {
              if (i === 0) {
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

          return { index: i, urls };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error occurred.";
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
          return { index: i, error: message };
        }
      }),
    );

    // Apply results — batched providers return all URLs from index-0 entry
    setImages((prev) => {
      const next = [...prev];
      for (const result of results) {
        if (result === null) continue;
        if ("error" in result) {
          next[result.index] = { status: "error", message: result.error };
        } else if (result.urls.length === 1) {
          next[result.index] = { status: "done", url: result.urls[0] };
        } else {
          // Spread batch results across all image slots
          result.urls.forEach((url, idx) => {
            next[idx] = { status: "done", url };
          });
        }
      }
      return next;
    });

    setIsGenerating(false);
  };

  // Group visible models by provider for the grouped select
  const modelsByProvider = Object.entries(PROVIDER_LABELS).flatMap(
    ([providerId, providerLabel]) => {
      const models = availableModels.filter((m) => m.provider === providerId);
      return models.length > 0 ? [{ providerLabel, models }] : [];
    },
  );

  const setStyle = <K extends keyof StyleStack>(k: K, v: StyleStack[K]) =>
    setStyleStack((prev) => ({ ...prev, [k]: v }));

  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const gridColClass =
    cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  const hasImages = images.length > 0;
  const noKeysConfigured = availableModels.length === 0;

  return (
    <div className="flex h-full gap-4 overflow-hidden p-4">
      {/* Left: Controls */}
      <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto pb-4 px-2">
        {/* Asset type selector */}
        <div className="space-y-1.5">
          <Label>Asset Type</Label>
          <Select
            value={assetType}
            onValueChange={(v) => setAssetType(v as AssetType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPE_DEFS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  <span>{a.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {a.description}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="h-px bg-border" />

        {/* Per-asset configuration form */}
        {assetType === "tileset" && (
          <TilesetConfigForm config={tilesetCfg} onChange={setTilesetCfg} />
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

        <div className="h-px bg-border" />

        {/* Style Stack */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Style Stack
        </p>
        <div className="space-y-1.5">
          <Label>Art Style</Label>
          <Select
            value={styleStack.artStyle}
            onValueChange={(v) => setStyle("artStyle", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ART_STYLES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Color Palette</Label>
          <Select
            value={styleStack.colorPalette}
            onValueChange={(v) => setStyle("colorPalette", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLOR_PALETTES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tile / Sprite Size</Label>
          <Select
            value={styleStack.spriteSize}
            onValueChange={(v) => setStyle("spriteSize", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPRITE_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
          <div className="space-y-0.5">
            <Label className="text-sm">Transparent Background</Label>
            <p className="text-[10px] text-muted-foreground">
              Remove background
            </p>
          </div>
          <Switch checked={transparent} onCheckedChange={setTransparent} />
        </div>

        <div className="h-px bg-border" />

        {/* Generated prompt — editable */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-prompt">Prompt</Label>
            {isPromptEdited && (
              <button
                onClick={resetPrompt}
                className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
          <textarea
            id="ai-prompt"
            className="flex min-h-24 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={generatedPrompt}
            onChange={(e) => {
              setGeneratedPrompt(e.target.value);
              setIsPromptEdited(true);
            }}
          />
        </div>

        {/* Reference image — only shown for models that support img2img */}
        {selectedModel?.supportsImg2Img && (
          <ImageUpload
            label="Reference Image (Optional)"
            value={initImage}
            onChange={setInitImage}
          />
        )}

        <div className="h-px bg-border" />

        {/* Model + count */}
        <div className="space-y-1.5">
          <Label>Model</Label>
          {noKeysConfigured ? (
            <p className="text-[11px] text-muted-foreground leading-snug">
              No models available — add API keys in{" "}
              <strong>Settings → AI API Keys</strong>.
            </p>
          ) : (
            <Select value={selectedId ?? ""} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelsByProvider.map(({ providerLabel, models }) => (
                  <SelectGroup key={providerLabel}>
                    <SelectLabel>{providerLabel}</SelectLabel>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Number of images</Label>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {n === 1 ? "image" : "images"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={generate} disabled={!canGenerate} className="w-full">
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate"
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Images are generated directly using your own API keys. Keys are stored
          encrypted in your browser.
        </p>
      </div>

      {/* Right: Image grid */}
      <div className="flex-1 overflow-y-auto">
        {noKeysConfigured ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No API keys configured</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Open <strong>Settings → AI API Keys</strong> and add at least one
              provider key to start generating images.
            </p>
          </div>
        ) : hasImages ? (
          <div className={`grid ${gridColClass} gap-3`}>
            {images.map((state, i) => (
              <ImageCell key={i} state={state} index={i} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="select-none text-sm text-muted-foreground">
              Configure an asset type and click Generate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
