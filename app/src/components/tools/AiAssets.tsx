import { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Loader2,
  Settings,
  X,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// AES-GCM encryption helpers (Web Crypto API) — key derived from fixed salt
// ---------------------------------------------------------------------------
const ENC_MATERIAL = "2dtiler-hf-v1";
const ENC_SALT = "2dtiler-salt-hf";

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    "raw",
    enc.encode(ENC_MATERIAL),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(ENC_SALT),
      iterations: 100_000,
      hash: "SHA-256",
    },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(token: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  const buf = new Uint8Array(iv.byteLength + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), iv.byteLength);
  return btoa(String.fromCharCode(...buf));
}

async function decryptToken(encoded: string): Promise<string | null> {
  try {
    const key = await deriveKey();
    const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf.slice(0, 12) },
      key,
      buf.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider + model definitions
// ---------------------------------------------------------------------------
type ProviderId = "hf-inference";
type TokenMap = Partial<Record<ProviderId, string>>;

interface ProviderMeta {
  id: ProviderId;
  name: string;
  lsKey: string;
  /** HTTP Authorization header prefix */
  authScheme: "Bearer";
  freeNote: string;
  keysUrl: string;
  description: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "hf-inference",
    name: "Hugging Face",
    lsKey: "hf_token_enc",
    authScheme: "Bearer",
    freeNote: "Rate-limited free tier (free account)",
    keysUrl: "https://huggingface.co/settings/tokens",
    description:
      "FLUX.1 Schnell/Dev, SDXL, SD 3. Create a fine-grained token with Inference API (serverless) read access.",
  },
];

interface ModelDef {
  label: string;
  provider: ProviderId;
  /** Provider-specific model identifier used in the API path */
  providerId: string;
  /** Optional trigger word to prepend to the prompt */
  triggerWord?: string;
}

// Only models verified live on each provider as of Feb 2026.
const MODELS: ModelDef[] = [
  // ── Hugging Face (hf-inference) ─────────────────────────────────────────
  {
    label: "FLUX.1 Schnell (fast)",
    provider: "hf-inference",
    providerId: "black-forest-labs/FLUX.1-schnell",
  },
  {
    label: "FLUX.1 Dev (quality)",
    provider: "hf-inference",
    providerId: "black-forest-labs/FLUX.1-dev",
  },
  {
    label: "SDXL Base 1.0",
    provider: "hf-inference",
    providerId: "stabilityai/stable-diffusion-xl-base-1.0",
  },
  {
    label: "Stable Diffusion 3 Medium",
    provider: "hf-inference",
    providerId: "stabilityai/stable-diffusion-3-medium-diffusers",
  },
];

const COUNT_OPTIONS = [1, 2];

const modelKey = (m: ModelDef) => `${m.provider}:${m.providerId}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Image Upload Helpers
// ---------------------------------------------------------------------------
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
              className="max-h-[120px] w-full object-contain"
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
            <Upload className="h-6 w-6 mb-1 opacity-50" />
            <p>Drag & drop an image here, or click to select</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenSetup screen
// ---------------------------------------------------------------------------
interface ProviderPanelState {
  value: string;
  show: boolean;
  error: string | null;
}

function TokenSetup({
  currentTokens,
  onSave,
}: {
  currentTokens: TokenMap;
  onSave: (tokens: TokenMap) => void;
}) {
  const [panels, setPanels] = useState<Record<ProviderId, ProviderPanelState>>(
    () =>
      Object.fromEntries(
        PROVIDERS.map((p) => [
          p.id,
          { value: currentTokens[p.id] ?? "", show: false, error: null },
        ]),
      ) as Record<ProviderId, ProviderPanelState>,
  );
  const [saving, setSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const setField = (id: ProviderId, patch: Partial<ProviderPanelState>) => {
    setPanels((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setGlobalError(null);
  };

  const hasAny = PROVIDERS.some((p) => panels[p.id].value.trim() !== "");

  async function handleSave() {
    if (!hasAny) {
      setGlobalError("Enter at least one API key to continue.");
      return;
    }
    setSaving(true);
    try {
      const newTokens: TokenMap = {};
      await Promise.all(
        PROVIDERS.map(async (p) => {
          const v = panels[p.id].value.trim();
          if (v) {
            const enc = await encryptToken(v);
            localStorage.setItem(p.lsKey, enc);
            newTokens[p.id] = v;
          } else {
            localStorage.removeItem(p.lsKey);
          }
        }),
      );
      onSave(newTokens);
    } catch {
      setGlobalError("Failed to save tokens. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl space-y-6 py-2">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">AI Generation Providers</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter an API key for at least one provider. Only models for
            providers you&apos;ve configured will appear in the generator.
          </p>
        </div>

        {/* Provider cards */}
        {PROVIDERS.map((p) => {
          const panel = panels[p.id];
          return (
            <div
              key={p.id}
              className="rounded-lg border bg-card p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary whitespace-nowrap">
                  {p.freeNote}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" htmlFor={`token-${p.id}`}>
                    API Key
                  </Label>
                  <a
                    href={p.keysUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:opacity-80"
                  >
                    Get key
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id={`token-${p.id}`}
                    type={panel.show ? "text" : "password"}
                    placeholder={p.id === "hf-inference" ? "hf_…" : "…"}
                    value={panel.value}
                    onChange={(e) =>
                      setField(p.id, { value: e.target.value, error: null })
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    className="pr-9 text-sm"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setField(p.id, { show: !panel.show })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={panel.show ? "Hide key" : "Show key"}
                  >
                    {panel.show ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {panel.error && (
                  <p className="text-xs text-destructive">{panel.error}</p>
                )}
              </div>
            </div>
          );
        })}

        {globalError && (
          <p className="text-sm text-destructive">{globalError}</p>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !hasAny}
          className="w-full"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
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
          <div className="w-full overflow-hidden rounded-full bg-muted h-1.5">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ animation: "progress-bar 1.8s ease-in-out infinite" }}
            />
          </div>
          <span className="text-xs text-muted-foreground">Generating…</span>
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
// Provider-specific generation helpers
// ---------------------------------------------------------------------------

async function generateHfInference(
  model: ModelDef,
  token: string,
  prompt: string,
  imageUrl: string | null,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`/api/hf/models/${model.providerId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429)
      throw new Error(
        "Rate limit exceeded. Please wait a moment and try again.",
      );
    if (res.status === 401 || res.status === 403)
      throw new Error(
        "Invalid or unauthorized Hugging Face token. Please reset it.",
      );
    if (res.status === 503) {
      const json = (await res.json().catch(() => ({}))) as {
        estimated_time?: number;
      };
      const wait = json?.estimated_time
        ? ` (~${Math.ceil(json.estimated_time)}s)`
        : "";
      throw new Error(`Model is loading, please retry${wait}.`);
    }
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Error ${res.status}: ${text.slice(0, 120)}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  type HFJson =
    | { generated_image?: string }
    | Array<{ generated_image?: string }>;
  const json = (await res.json()) as HFJson;
  const b64 = Array.isArray(json)
    ? json[0]?.generated_image
    : json?.generated_image;
  if (b64) return `data:image/png;base64,${b64}`;

  throw new Error("Unexpected response format from Hugging Face API.");
}

// ---------------------------------------------------------------------------
// Generator (main UI once at least one token is available)
// ---------------------------------------------------------------------------
function Generator({
  tokens,
  onManageTokens,
}: {
  tokens: TokenMap;
  onManageTokens: () => void;
}) {
  const availableModels = MODELS.filter((m) => !!tokens[m.provider]);

  const [mode, setMode] = useState<"simple" | "pixel">("simple");

  // Simple mode state
  const [prompt, setPrompt] = useState("");
  const [view, setView] = useState("None");
  const [direction, setDirection] = useState("None");
  const [initImage, setInitImage] = useState<string | null>(null);
  const [width, setWidth] = useState("64px");
  const [height, setHeight] = useState("64px");
  const [transparent, setTransparent] = useState(false);

  // Pixel mode state
  const [sourceImage, setSourceImage] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState(() =>
    availableModels.length > 0 ? modelKey(availableModels[0]) : "",
  );
  const [count, setCount] = useState(2);
  const [images, setImages] = useState<ImageState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // Track blob object URLs (HF-inference) for cleanup on unmount
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const selectedModel =
    availableModels.find((m) => modelKey(m) === selectedKey) ??
    availableModels[0];

  const canGenerate =
    !isGenerating &&
    selectedModel &&
    (mode === "simple" ? prompt.trim().length > 0 : sourceImage !== null);

  const generate = useCallback(async () => {
    let finalPrompt = "";
    let imageToUse: string | null = null;

    if (mode === "simple") {
      if (!prompt.trim()) return;
      finalPrompt = prompt.trim();
      if (selectedModel?.triggerWord) {
        finalPrompt = `${selectedModel.triggerWord}, ${finalPrompt}`;
      }
      if (view !== "None") {
        finalPrompt += `, ${view} view`;
      }
      if (direction !== "None") {
        finalPrompt += `, facing ${direction}`;
      }
      finalPrompt += `, ${width} x ${height} pixel art`;
      if (transparent) {
        finalPrompt += `, transparent background`;
      }
      imageToUse = initImage;
    } else {
      if (!sourceImage) return;
      finalPrompt = "pixel art, 8-bit, retro game art";
      if (selectedModel?.triggerWord) {
        finalPrompt = `${selectedModel.triggerWord}, ${finalPrompt}`;
      }
      imageToUse = sourceImage;
    }

    console.log("Final prompt:", finalPrompt);

    if (isGenerating || !selectedModel) return;

    setIsGenerating(true);
    setImages(
      Array.from({ length: count }, () => ({ status: "loading" as const })),
    );

    const results = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 130_000);

        try {
          const token = tokens[selectedModel.provider]!;

          const url = await generateHfInference(
            selectedModel,
            token,
            finalPrompt,
            imageToUse,
            controller.signal,
          );
          if (url.startsWith("blob:")) blobUrlsRef.current.push(url);

          clearTimeout(timeoutId);
          return { index: i, state: { status: "done" as const, url } };
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof Error && err.name === "AbortError") {
            return {
              index: i,
              state: {
                status: "error" as const,
                message: "Request timed out after 2 minutes.",
              },
            };
          }
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
  }, [
    mode,
    prompt,
    view,
    direction,
    width,
    height,
    transparent,
    initImage,
    sourceImage,
    selectedModel,
    count,
    tokens,
    isGenerating,
  ]);

  // Group available models by provider for grouped <Select>
  const modelsByProvider = PROVIDERS.map((p) => ({
    provider: p,
    models: availableModels.filter((m) => m.provider === p.id),
  })).filter((g) => g.models.length > 0);

  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const gridColClass =
    cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  const hasImages = images.length > 0;

  return (
    <div className="flex h-full gap-4 overflow-hidden p-4">
      {/* Left: Controls */}
      <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto pb-4 pr-2">
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
                className="flex min-h-[80px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Describe the image to generate…"
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

            <ImageUpload
              label="Init Image (Optional)"
              value={initImage}
              onChange={setInitImage}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Width</Label>
                <Select value={width} onValueChange={setWidth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["16px", "32px", "64px", "128px", "256px"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Height</Label>
                <Select value={height} onValueChange={setHeight}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["16px", "32px", "64px", "128px", "256px"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
            <ImageUpload
              label="Source Image"
              value={sourceImage}
              onChange={setSourceImage}
            />
          </>
        )}

        <div className="my-2 h-px bg-border" />

        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelsByProvider.map(({ provider, models }) => (
                <SelectGroup key={provider.id}>
                  <SelectLabel>{provider.name}</SelectLabel>
                  {models.map((m) => (
                    <SelectItem key={modelKey(m)} value={modelKey(m)}>
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
              Generating…
            </>
          ) : (
            "Generate"
          )}
        </Button>

        <div className="mt-auto pt-2">
          <button
            onClick={onManageTokens}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline hover:text-foreground"
          >
            <Settings className="h-3 w-3" />
            Manage API Keys
          </button>
        </div>
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
  const [tokens, setTokens] = useState<TokenMap>({});
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    Promise.all(
      PROVIDERS.map(async (p) => {
        const enc = localStorage.getItem(p.lsKey);
        return { id: p.id, token: enc ? await decryptToken(enc) : null };
      }),
    ).then((results) => {
      const loaded: TokenMap = {};
      for (const { id, token } of results) {
        if (token) loaded[id as ProviderId] = token;
      }
      setTokens(loaded);
      setLoading(false);
    });
  }, []);

  const hasAnyToken = Object.keys(tokens).length > 0;

  function handleSaveTokens(newTokens: TokenMap) {
    setTokens(newTokens);
    setShowSetup(false);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAnyToken || showSetup) {
    return <TokenSetup currentTokens={tokens} onSave={handleSaveTokens} />;
  }

  return (
    <Generator tokens={tokens} onManageTokens={() => setShowSetup(true)} />
  );
}
