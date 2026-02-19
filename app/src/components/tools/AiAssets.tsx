import { useState, useEffect, useCallback, useRef } from "react";
import { ExternalLink, Eye, EyeOff, Key, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
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

const LS_KEY = "hf_token_enc";

// ---------------------------------------------------------------------------
// Models + options
// ---------------------------------------------------------------------------
const MODELS = [{ id: "stabilityai/sdxl-turbo", label: "SDXL Turbo" }];
const COUNT_OPTIONS = [1, 2, 3, 4, 6, 8];

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
function TokenSetup({ onSave }: { onSave: (token: string) => void }) {
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const t = input.trim();
    if (!t) {
      setError("Please enter your access token.");
      return;
    }
    setSaving(true);
    try {
      const enc = await encryptToken(t);
      localStorage.setItem(LS_KEY, enc);
      onSave(t);
    } catch {
      setError("Failed to save token. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Hugging Face Access Token</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            To use AI image generation, you need a free Hugging Face access
            token.
          </p>
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-2 text-muted-foreground">
            <p>
              Get your token at{" "}
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-1 hover:opacity-80"
              >
                huggingface.co/settings/tokens
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p>
              Sign up is free — no credit card required. Create a token with{" "}
              <strong className="text-foreground">
                Inference API (serverless)
              </strong>{" "}
              read access to start generating images immediately.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hf-token">Access Token</Label>
          <div className="relative">
            <Input
              id="hf-token"
              type={show ? "text" : "password"}
              placeholder="hf_…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="pr-10"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={show ? "Hide token" : "Show token"}
            >
              {show ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Token &amp; Continue
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
// Generator (main UI once token is available)
// ---------------------------------------------------------------------------
function Generator({
  token,
  onResetToken,
}: {
  token: string;
  onResetToken: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [count, setCount] = useState(4);
  const [images, setImages] = useState<ImageState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const objectUrlsRef = useRef<string[]>([]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const generate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setImages(
      Array.from({ length: count }, () => ({ status: "loading" as const })),
    );

    const results = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60_000);

        try {
          const res = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ inputs: prompt }),
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);

          if (!res.ok) {
            if (res.status === 429) {
              return {
                index: i,
                state: {
                  status: "error" as const,
                  message:
                    "Rate limit exceeded. Please wait a moment and try again.",
                },
              };
            }
            if (res.status === 401 || res.status === 403) {
              return {
                index: i,
                state: {
                  status: "error" as const,
                  message:
                    "Invalid or unauthorized token. Please reset your access token.",
                },
              };
            }
            if (res.status === 503) {
              let wait = "";
              const json = (await res.json().catch(() => ({}))) as {
                estimated_time?: number;
              };
              if (json?.estimated_time)
                wait = ` (~${Math.ceil(json.estimated_time)}s)`;
              return {
                index: i,
                state: {
                  status: "error" as const,
                  message: `Model is loading, please retry${wait}.`,
                },
              };
            }
            const text = await res.text().catch(() => "Unknown error");
            return {
              index: i,
              state: {
                status: "error" as const,
                message: `Error ${res.status}: ${text.slice(0, 120)}`,
              },
            };
          }

          const contentType = res.headers.get("content-type") ?? "";

          if (contentType.startsWith("image/")) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            return { index: i, state: { status: "done" as const, url } };
          }

          // Some models return JSON with base64
          type HFJsonResponse =
            | { generated_image?: string }
            | Array<{ generated_image?: string }>;
          const json = (await res.json()) as HFJsonResponse;
          const b64 = Array.isArray(json)
            ? json[0]?.generated_image
            : json?.generated_image;
          if (b64) {
            return {
              index: i,
              state: {
                status: "done" as const,
                url: `data:image/png;base64,${b64}`,
              },
            };
          }

          return {
            index: i,
            state: {
              status: "error" as const,
              message: "Unexpected response format from API.",
            },
          };
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof Error && err.name === "AbortError") {
            return {
              index: i,
              state: {
                status: "error" as const,
                message: "Request timed out after 60 seconds.",
              },
            };
          }
          const msg =
            err instanceof Error ? err.message : "Unknown error occurred.";
          return {
            index: i,
            state: { status: "error" as const, message: msg },
          };
        }
      }),
    );

    setImages((prev) => {
      const next = [...prev];
      for (const { index, state } of results) next[index] = state;
      return next;
    });
    setIsGenerating(false);
  }, [prompt, model, count, token, isGenerating]);

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
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
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
          disabled={isGenerating || !prompt.trim()}
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
            onClick={onResetToken}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Reset API Token
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
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const enc = localStorage.getItem(LS_KEY);
    const work = enc ? decryptToken(enc) : Promise.resolve(null);
    work.then((t) => {
      setToken(t);
      setLoading(false);
    });
  }, []);

  function handleResetToken() {
    localStorage.removeItem(LS_KEY);
    setToken(null);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!token) {
    return <TokenSetup onSave={setToken} />;
  }

  return <Generator token={token} onResetToken={handleResetToken} />;
}
