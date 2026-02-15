/**
 * Obfuscation-level encryption for API keys stored in localStorage.
 *
 * Uses AES-GCM via the Web Crypto API with PBKDF2 key derivation.
 * This prevents casual reading of keys from DevTools but is NOT truly secure
 * against a determined attacker with local access (no user-provided passphrase).
 */

const APP_PASSPHRASE = "2dtiler-ai-provider-keys";
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(APP_PASSPHRASE),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptValue(plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  return JSON.stringify({
    s: toBase64(salt),
    i: toBase64(iv),
    c: toBase64(ciphertext),
  });
}

export async function decryptValue(encrypted: string): Promise<string> {
  const { s, i, c } = JSON.parse(encrypted);
  const salt = fromBase64(s);
  const iv = fromBase64(i);
  const ciphertext = fromBase64(c);
  const key = await deriveKey(salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return decoder.decode(plaintext);
}
