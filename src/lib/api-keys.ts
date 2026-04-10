/**
 * API key storage with AES-GCM encryption.
 *
 * NOTE: This is obfuscation-level protection that prevents casual plaintext
 * inspection of localStorage. It does NOT protect against someone who can
 * inspect the source code, as the passphrase is hardcoded. Keys are still
 * accessible to any JavaScript running on the same origin.
 */

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

import type { ApiKeyProvider } from "@/types/api-keys";

export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    url: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    url: "https://aistudio.google.com/apikey",
    placeholder: "AIza...",
  },
  {
    id: "together",
    label: "Together AI",
    url: "https://api.together.xyz/settings/api-keys",
    placeholder: "Paste your Together AI key",
  },
  {
    id: "xai",
    label: "xAI (Grok / Aurora)",
    url: "https://console.x.ai",
    placeholder: "xai-...",
  },
];

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

// Hardcoded passphrase + salt — obfuscation only, not true security.
const PASSPHRASE = "2dtiler-ai-keys-v1";
const SALT = new Uint8Array([
  0x2d, 0x74, 0x69, 0x6c, 0x65, 0x72, 0x2d, 0x73, 0x61, 0x6c, 0x74, 0x2d, 0x76,
  0x31, 0x00, 0x00,
]);

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(PASSPHRASE),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptKey(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  // Prefix iv (12 bytes) before ciphertext, then base64-encode the whole thing
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptKey(b64: string): Promise<string> {
  const key = await deriveKey();
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const cipherBuf = bytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBuf,
  );
  return new TextDecoder().decode(plainBuf);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const LS_PREFIX = "ai-key-";

/** Encrypt and persist an API key to localStorage. */
export async function saveApiKey(
  providerId: string,
  apiKey: string,
): Promise<void> {
  try {
    const cipher = await encryptKey(apiKey);
    localStorage.setItem(LS_PREFIX + providerId, cipher);
    window.dispatchEvent(new CustomEvent("ai-keys-changed"));
  } catch {
    // Silently fail (e.g. private-browsing quota)
  }
}

/** Load and decrypt an API key from localStorage. Returns null if missing or corrupt. */
export async function loadApiKey(providerId: string): Promise<string | null> {
  try {
    const raw = localStorage.getItem(LS_PREFIX + providerId);
    if (!raw) return null;
    return await decryptKey(raw);
  } catch {
    return null;
  }
}

/** Remove an API key from localStorage. */
export function deleteApiKey(providerId: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + providerId);
    window.dispatchEvent(new CustomEvent("ai-keys-changed"));
  } catch {
    // Silently fail
  }
}

/** Returns true if a (potentially encrypted) value is stored for this provider. */
export function hasApiKey(providerId: string): boolean {
  return localStorage.getItem(LS_PREFIX + providerId) !== null;
}

/** Returns a map of providerId → decrypted key (or null). Resolves all at once. */
export async function loadAllApiKeys(): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    API_KEY_PROVIDERS.map(async (p) => [p.id, await loadApiKey(p.id)] as const),
  );
  return Object.fromEntries(entries);
}
