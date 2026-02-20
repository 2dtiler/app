import { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Loader2,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
type ProviderId = "hf-inference" | "fal-ai";
type TokenMap = Partial<Record<ProviderId, string>>;

interface ProviderMeta {
  id: ProviderId;
  name: string;
  lsKey: string;
  /** HTTP Authorization header prefix */
  authScheme: "Bearer" | "Key";
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
  {
    id: "fal-ai",
    name: "fal.ai",
    lsKey: "fal_token_enc",
    authScheme: "Key",
    freeNote: "Free credits on signup — no credit card required",
    keysUrl: "https://fal.ai/dashboard/keys",
    description:
      "Z-Image Turbo, FLUX.1 Schnell/Dev, Fast SDXL, Qwen Image. Uses an async queue — results poll automatically.",
  },
];

interface ModelDef {
  label: string;
  provider: ProviderId;
  /** Provider-specific model identifier used in the API path */
  providerId: string;
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
  // ── fal.ai ───────────────────────────────────────────────────────────────
  {
    label: "Z-Image Turbo",
    provider: "fal-ai",
    providerId: "fal-ai/z-image/turbo",
  },
  {
    label: "FLUX.1 Schnell (fast)",
    provider: "fal-ai",
    providerId: "fal-ai/flux/schnell",
  },
  {
    label: "FLUX.1 Dev (quality)",
    provider: "fal-ai",
    providerId: "fal-ai/flux/dev",
  },
  {
    label: "SDXL (fast)",
    provider: "fal-ai",
    providerId: "fal-ai/fast-sdxl",
  },
  {
    label: "Qwen Image",
    provider: "fal-ai",
    providerId: "fal-ai/qwen-image",
  },
];

const COUNT_OPTIONS = [1, 2, 3, 4, 6, 8];

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

async function generateFalAi(
  model: ModelDef,
  token: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  // Submit to async queue
  const submitRes = await fetch(`/api/fal/${model.providerId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!submitRes.ok) {
    if (submitRes.status === 401 || submitRes.status === 403)
      throw new Error(
        "Invalid or unauthorized fal.ai API key. Please reset it.",
      );
    const text = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`fal.ai error ${submitRes.status}: ${text.slice(0, 120)}`);
  }

  type FalSubmit = {
    request_id: string;
    status_url: string;
    response_url: string;
  };
  const submitData = (await submitRes.json()) as FalSubmit;

  // The returned URLs are absolute (queue.fal.run/…). Strip the host so we
  // can route them through our CORS proxy at /api/fal/….
  const statusPath = submitData.status_url.replace("https://queue.fal.run", "");
  const responsePath = submitData.response_url.replace(
    "https://queue.fal.run",
    "",
  );

  // Poll until COMPLETED (max ~2 min)
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((r) => setTimeout(r, 1_000));

    const statusRes = await fetch(`/api/fal${statusPath}`, {
      headers: { Authorization: `Key ${token}` },
      signal,
    });
    const statusData = (await statusRes.json()) as { status: string };

    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(`/api/fal${responsePath}`, {
        headers: { Authorization: `Key ${token}` },
        signal,
      });
      type FalResult = {
        images?: Array<{ url: string }>;
      };
      const result = (await resultRes.json()) as FalResult;
      const url = result.images?.[0]?.url;
      if (!url) throw new Error("fal.ai returned no image in response.");
      return url;
    }

    if (statusData.status === "ERROR" || statusData.status === "FAILED") {
      throw new Error("fal.ai generation failed.");
    }
  }

  throw new Error("fal.ai request timed out after 2 minutes.");
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

  const [prompt, setPrompt] = useState("");
  const [selectedKey, setSelectedKey] = useState(() =>
    availableModels.length > 0 ? modelKey(availableModels[0]) : "",
  );
  const [count, setCount] = useState(4);
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

  const generate = useCallback(async () => {
    if (!prompt.trim() || isGenerating || !selectedModel) return;

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
          let url: string;

          if (selectedModel.provider === "hf-inference") {
            url = await generateHfInference(
              selectedModel,
              token,
              prompt,
              controller.signal,
            );
            if (url.startsWith("blob:")) blobUrlsRef.current.push(url);
          } else {
            url = await generateFalAi(
              selectedModel,
              token,
              prompt,
              controller.signal,
            );
          }

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
  }, [prompt, selectedModel, count, tokens, isGenerating]);

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
      <div className="flex w-64 shrink-0 flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ai-prompt">Prompt</Label>
          <textarea
            id="ai-prompt"
            className="flex min-h-[140px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Describe the image to generate…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

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

        <Button
          onClick={generate}
          disabled={isGenerating || !prompt.trim() || !selectedModel}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate"
          )}
        </Button>

        <div className="mt-auto border-t pt-4">
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
