import { useState } from "react";
import { Loader2, X, Upload } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - puter.js ships its own types but bundler moduleResolution may not resolve them
import puter from "@heyputer/puter.js";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Ratio = "1:1" | "4:3" | "16:9" | "3:4";

interface ModelDef {
  id: string;
  label: string;
  /** puter.js provider string */
  provider: "openai-image-generation" | "gemini" | "together" | "xai";
  /** Model identifier passed to puter.ai.txt2img */
  puterModel: string;
  /** Whether this model accepts an input image (img2img) */
  supportsImg2Img: boolean;
  /** Aspect ratios this model supports; undefined = all; empty array = none */
  supportedRatios?: Ratio[];
}

interface RatioDef {
  value: Ratio;
  label: string;
  w: number;
  h: number;
}

type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MODELS: ModelDef[] = [
  {
    id: "gpt-image-1-mini",
    label: "GPT Image 1 Mini (fast)",
    provider: "openai-image-generation",
    puterModel: "gpt-image-1-mini",
    supportsImg2Img: false,
  },
  {
    id: "gpt-image-1",
    label: "GPT Image 1 (quality)",
    provider: "openai-image-generation",
    puterModel: "gpt-image-1",
    supportsImg2Img: false,
  },
  {
    id: "dall-e-3",
    label: "DALL-E 3",
    provider: "openai-image-generation",
    puterModel: "dall-e-3",
    supportsImg2Img: false,
  },
  {
    id: "gemini-img",
    label: "Gemini 3 Pro Image",
    provider: "gemini",
    puterModel: "gemini-3-pro-image-preview",
    supportsImg2Img: true,
    supportedRatios: ["1:1"],
  },
  {
    id: "grok-image",
    label: "Grok Image (xAI)",
    provider: "xai",
    puterModel: "grok-2-image",
    supportsImg2Img: false,
    supportedRatios: [],
  },
  {
    id: "flux-schnell",
    label: "FLUX.1 Schnell (Together)",
    provider: "together",
    puterModel: "black-forest-labs/FLUX.1-schnell-Free",
    supportsImg2Img: true,
  },
];

/** Provider display names for grouping the model select */
const PROVIDER_LABELS: Record<string, string> = {
  "openai-image-generation": "OpenAI",
  gemini: "Google",
  xai: "xAI",
  together: "Together AI",
};

const ALL_RATIOS: RatioDef[] = [
  { value: "1:1", label: "Square (1:1)", w: 1024, h: 1024 },
  { value: "4:3", label: "Landscape (4:3)", w: 1024, h: 768 },
  { value: "16:9", label: "Wide (16:9)", w: 1280, h: 720 },
  { value: "3:4", label: "Portrait (3:4)", w: 768, h: 1024 },
];

const COUNT_OPTIONS = [1, 2];

// ---------------------------------------------------------------------------
// Image Upload helper component
// ---------------------------------------------------------------------------
function ImageUpload({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  label: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const resized = await resizeImage(file, 1280);
      onChange(resized);
    } catch (err) {
      console.error("Failed to resize image", err);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/25 hover:bg-muted/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        {value ? (
          <div className="relative w-full">
            <img
              src={value}
              alt="Upload preview"
              className="max-h-30 w-full object-contain"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
            <Upload className="mb-1 h-6 w-6 opacity-50" />
            <p>Drag &amp; drop an image here, or click to select</p>
          </div>
        )}
      </div>
    </div>
  );
}

async function resizeImage(
  file: File,
  maxSize: number = 1280,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL(file.type));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Strip the "data:<mime>;base64," prefix, return base64 string and mime type */
function parseDataUrl(dataUrl: string): { b64: string; mime: string } {
  const [header, b64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:([^;]+)/);
  return { b64: b64 ?? "", mime: mimeMatch?.[1] ?? "image/png" };
}

// ---------------------------------------------------------------------------
// Single image cell
// ---------------------------------------------------------------------------
function ImageCell({ state, index }: { state: ImageState; index: number }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/30 flex items-center justify-center">
      {state.status === "idle" && (
        <span className="text-xs text-muted-foreground select-none">
          #{index + 1}
        </span>
      )}

      {state.status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Generating...</span>
        </div>
      )}

      {state.status === "done" && (
        <img
          src={state.url}
          alt={`Generated image ${index + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {state.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <X className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-xs text-destructive leading-snug">
            {state.message}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generator (main UI)
// ---------------------------------------------------------------------------
function Generator() {
  const [mode, setMode] = useState<"simple" | "pixel">("simple");

  // Simple mode state
  const [prompt, setPrompt] = useState("");
  const [view, setView] = useState("None");
  const [direction, setDirection] = useState("None");
  const [initImage, setInitImage] = useState<string | null>(null);
  const [ratio, setRatio] = useState<Ratio>("1:1");
  const [transparent, setTransparent] = useState(false);

  // Pixel mode state
  const [sourceImage, setSourceImage] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState(MODELS[0].id);
  const [count, setCount] = useState(2);
  const [images, setImages] = useState<ImageState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedModel = MODELS.find((m) => m.id === selectedId) ?? MODELS[0];

  // Ratios available for the current model
  const availableRatios =
    selectedModel.supportedRatios !== undefined
      ? ALL_RATIOS.filter((r) =>
          (selectedModel.supportedRatios as Ratio[]).includes(r.value),
        )
      : ALL_RATIOS;

  // Fall back to first available ratio when the current one is not supported
  const effectiveRatio =
    availableRatios.find((r) => r.value === ratio) ??
    availableRatios[0] ??
    ALL_RATIOS[0];

  const showRatioSelector = availableRatios.length > 0;
  const showInitImage = mode === "simple" && selectedModel.supportsImg2Img;
  const pixelModeSupported = selectedModel.supportsImg2Img;

  const canGenerate =
    !isGenerating &&
    selectedModel !== undefined &&
    (mode === "simple"
      ? prompt.trim().length > 0
      : pixelModeSupported && sourceImage !== null);

  const generate = async () => {
    if (isGenerating || !selectedModel) return;

    let finalPrompt = "";
    let initImgB64: string | null = null;
    let initImgMime: string | null = null;

    if (mode === "simple") {
      if (!prompt.trim()) return;
      finalPrompt = prompt.trim();
      if (view !== "None") finalPrompt += `, ${view} view`;
      if (direction !== "None") finalPrompt += `, facing ${direction}`;
      finalPrompt += ", pixel art, 8-bit, retro game art";
      if (transparent) finalPrompt += ", transparent background";
      if (initImage && selectedModel.supportsImg2Img) {
        const parsed = parseDataUrl(initImage);
        initImgB64 = parsed.b64;
        initImgMime = parsed.mime;
      }
    } else {
      if (!sourceImage || !selectedModel.supportsImg2Img) return;
      finalPrompt = "pixel art, 8-bit, retro game art";
      const parsed = parseDataUrl(sourceImage);
      initImgB64 = parsed.b64;
      initImgMime = parsed.mime;
    }

    setIsGenerating(true);
    setImages(
      Array.from({ length: count }, () => ({ status: "loading" as const })),
    );

    const results = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const options: Record<string, any> = {
            provider: selectedModel.provider,
            model: selectedModel.puterModel,
          };

          // Provider-specific size + img2img options
          if (selectedModel.provider === "openai-image-generation") {
            options.ratio = { w: effectiveRatio.w, h: effectiveRatio.h };
          } else if (selectedModel.provider === "together") {
            options.width = effectiveRatio.w;
            options.height = effectiveRatio.h;
            if (initImgB64) options.image_base64 = initImgB64;
          } else if (selectedModel.provider === "gemini") {
            options.ratio = { w: 1024, h: 1024 };
            if (initImgB64) {
              options.input_image = initImgB64;
              options.input_image_mime_type = initImgMime;
            }
          }
          // xAI: no size or img2img options supported

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imgEl = await (puter as any).ai.txt2img(finalPrompt, options);
          const url: string =
            imgEl instanceof HTMLImageElement ? imgEl.src : String(imgEl);
          return { index: i, state: { status: "done" as const, url } };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error occurred.";
          return { index: i, state: { status: "error" as const, message } };
        }
      }),
    );

    setImages((prev) => {
      const next = [...prev];
      for (const { index, state } of results) next[index] = state;
      return next;
    });
    setIsGenerating(false);
  };

  // Group models by provider for the grouped select
  const modelsByProvider = Object.entries(PROVIDER_LABELS).flatMap(
    ([providerId, providerLabel]) => {
      const models = MODELS.filter((m) => m.provider === providerId);
      return models.length > 0 ? [{ providerLabel, models }] : [];
    },
  );

  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const gridColClass =
    cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  const hasImages = images.length > 0;

  return (
    <div className="flex h-full gap-4 overflow-hidden p-4">
      {/* Left: Controls */}
      <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto pb-4 px-2">
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as "simple" | "pixel")}
        >
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="simple" className="text-xs">
              Simple
            </TabsTrigger>
            <TabsTrigger value="pixel" className="text-xs">
              Pixel Art
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "simple" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ai-prompt">Prompt</Label>
              <textarea
                id="ai-prompt"
                className="flex min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Describe the image to generate..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>View</Label>
              <Select value={view} onValueChange={setView}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="Side">Side</SelectItem>
                  <SelectItem value="Low top-down">Low top-down</SelectItem>
                  <SelectItem value="High top-down">High top-down</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="South">South (facing camera)</SelectItem>
                  <SelectItem value="South-West">South-West</SelectItem>
                  <SelectItem value="West">West (facing left)</SelectItem>
                  <SelectItem value="North-West">North-West</SelectItem>
                  <SelectItem value="North">North (facing away)</SelectItem>
                  <SelectItem value="North-East">North-East</SelectItem>
                  <SelectItem value="East">East (facing right)</SelectItem>
                  <SelectItem value="South-East">South-East</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {showInitImage && (
              <ImageUpload
                label="Init Image (Optional)"
                value={initImage}
                onChange={setInitImage}
              />
            )}

            {showRatioSelector && (
              <div className="space-y-1.5">
                <Label>Aspect Ratio</Label>
                <Select
                  value={effectiveRatio.value}
                  onValueChange={(v) => setRatio(v as Ratio)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRatios.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-sm">Transparent</Label>
                <p className="text-[10px] text-muted-foreground">
                  Remove background
                </p>
              </div>
              <Switch checked={transparent} onCheckedChange={setTransparent} />
            </div>
          </>
        )}

        {mode === "pixel" && (
          <>
            {pixelModeSupported ? (
              <ImageUpload
                label="Source Image"
                value={sourceImage}
                onChange={setSourceImage}
              />
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                The selected model does not support image-to-image. Switch to
                Gemini or FLUX.1 Schnell for Pixel Art conversion.
              </div>
            )}
          </>
        )}

        <div className="my-2 h-px bg-border" />

        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
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
              Generating...
            </>
          ) : (
            "Generate"
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Powered by{" "}
          <a
            href="https://developer.puter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80"
          >
            Puter.js
          </a>
          . Images are generated using your Puter account credits.
        </p>
      </div>

      {/* Right: Image grid */}
      <div className="flex-1 overflow-y-auto">
        {hasImages ? (
          <div className={`grid ${gridColClass} gap-3`}>
            {images.map((state, i) => (
              <ImageCell key={i} state={state} index={i} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="select-none text-sm text-muted-foreground">
              Enter a prompt and click Generate to create images.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
export function AiAssets() {
  return <Generator />;
}
