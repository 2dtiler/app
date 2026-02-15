import { encryptValue, decryptValue } from "@/lib/crypto";
import type { AIProviderConfig } from "@/types";

const STORAGE_KEY = "2dtiler-ai-providers";

export type AIProviderId = "ollama" | "anthropic" | "openai" | "google-gemini";

export const DEFAULT_PROVIDERS: AIProviderConfig[] = [
  {
    id: "ollama",
    name: "Ollama",
    enabled: false,
    apiKey: "",
    baseUrl: "http://localhost:11434",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    enabled: false,
    apiKey: "",
    baseUrl: "",
  },
  {
    id: "openai",
    name: "OpenAI",
    enabled: false,
    apiKey: "",
    baseUrl: "",
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    enabled: false,
    apiKey: "",
    baseUrl: "",
  },
];

interface StoredProvider {
  id: string;
  name: string;
  enabled: boolean;
  encryptedApiKey: string;
  baseUrl: string;
}

export async function getProviders(): Promise<AIProviderConfig[]> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_PROVIDERS.map((p) => ({ ...p }));

  try {
    const stored: StoredProvider[] = JSON.parse(raw);
    const providers: AIProviderConfig[] = [];

    for (const def of DEFAULT_PROVIDERS) {
      const saved = stored.find((s) => s.id === def.id);
      if (saved) {
        let apiKey = "";
        if (saved.encryptedApiKey) {
          try {
            apiKey = await decryptValue(saved.encryptedApiKey);
          } catch {
            apiKey = "";
          }
        }
        providers.push({
          id: saved.id,
          name: saved.name,
          enabled: saved.enabled,
          apiKey,
          baseUrl: saved.baseUrl ?? def.baseUrl ?? "",
        });
      } else {
        providers.push({ ...def });
      }
    }

    return providers;
  } catch {
    return DEFAULT_PROVIDERS.map((p) => ({ ...p }));
  }
}

export async function saveProviders(
  providers: AIProviderConfig[],
): Promise<void> {
  const stored: StoredProvider[] = [];

  for (const p of providers) {
    let encryptedApiKey = "";
    if (p.apiKey) {
      encryptedApiKey = await encryptValue(p.apiKey);
    }
    stored.push({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      encryptedApiKey,
      baseUrl: p.baseUrl ?? "",
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export async function saveProvider(provider: AIProviderConfig): Promise<void> {
  const providers = await getProviders();
  const idx = providers.findIndex((p) => p.id === provider.id);
  if (idx >= 0) {
    providers[idx] = provider;
  } else {
    providers.push(provider);
  }
  await saveProviders(providers);
}
