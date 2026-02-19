import { Hono } from "hono";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  LOSPEC_PALETTES: KVNamespace;
  RATE_LIMITER: RateLimiter;
}

interface Palette {
  name: string;
  author: string;
  colors: string[];
}

const app = new Hono<{ Bindings: Env }>();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns all keys from a KV namespace, transparently handling pagination. */
async function listAllKeys(kv: KVNamespace): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await kv.list({ cursor });
    for (const key of result.keys) {
      keys.push(key.name);
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor !== undefined);

  return keys;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── HTTP Routes ─────────────────────────────────────────────────────────────

/**
 * GET /
 * Returns a blank API route to verify the worker is running.
 */
app.get("/", async (c) => {
  return c.json({});
});

/**
 * GET /lospec_palettes
 * Returns all fully-populated palette entries as a JSON array.
 * Entries that are still pending fetch (stored as "{}") are omitted.
 */
app.get("/lospec_palettes", async (c) => {
  const ip = c.req.raw.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return c.json({ error: "Rate limit exceeded. Try again in an hour." }, 429);
  }

  const kv = c.env.LOSPEC_PALETTES;
  const palettes: Palette[] = [];
  const keys = await listAllKeys(kv);

  for (const key of keys) {
    const value = await kv.get(key);
    if (!value || value === "{}") continue;

    try {
      const palette = JSON.parse(value) as Palette;
      if (palette.name && Array.isArray(palette.colors)) {
        palettes.push(palette);
      }
    } catch {
      // skip malformed KV entries
    }
  }

  return c.json(palettes);
});

// ─── Scheduled Job ───────────────────────────────────────────────────────────

/**
 * Runs daily at 12:00 UTC (see wrangler.toml).
 *
 * Phase 1 – Discover: fetch the Lospec sitemap and add any unknown palette
 *   slugs to KV as empty stubs ("{}").
 *
 * Phase 2 – Populate: for every slug that still holds an empty stub, fetch
 *   the palette JSON from the Lospec API and persist the real data.
 *   A 3-second delay is inserted between requests to avoid flooding the server.
 */
async function syncPalettes(env: Env, signal: AbortSignal): Promise<void> {
  // ── Phase 1: discover new slugs ──────────────────────────────────────────

  const sitemapRes = await fetch("https://lospec.com/sitemap.xml", { signal });
  if (!sitemapRes.ok) {
    console.error(`Failed to fetch sitemap: ${sitemapRes.status}`);
    return;
  }

  const sitemapText = await sitemapRes.text();
  const slugs = new Set<string>();
  const locRegex = /<loc>https:\/\/lospec\.com\/palette-list\/([^</]+)<\/loc>/g;
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(sitemapText)) !== null) {
    slugs.add(match[1]);
  }

  console.log(`Sitemap: found ${slugs.size} palette URLs`);

  const existingKeys = new Set(await listAllKeys(env.LOSPEC_PALETTES));

  let added = 0;
  for (const slug of slugs) {
    if (!existingKeys.has(slug)) {
      await env.LOSPEC_PALETTES.put(slug, "{}");
      added++;
    }
  }

  console.log(`Seeded ${added} new palette stubs into KV`);

  // ── Phase 2: populate empty stubs ────────────────────────────────────────

  // New slugs we just seeded are guaranteed to be "{}".
  const newEmptySlugs = [...slugs].filter((s) => !existingKeys.has(s));

  // Check pre-existing keys in parallel to find any leftover empty stubs from
  // a previous partial run — avoids a redundant listAllKeys call and
  // serialised per-key gets.
  const existingEmptyKeys = (
    await Promise.all(
      [...existingKeys].map(async (key) => {
        const value = await env.LOSPEC_PALETTES.get(key);
        return value === "{}" ? key : null;
      }),
    )
  ).filter((k): k is string => k !== null);

  const emptyKeys = [...existingEmptyKeys, ...newEmptySlugs];

  console.log(`Fetching data for ${emptyKeys.length} empty palette entries`);

  for (let i = 0; i < emptyKeys.length; i++) {
    if (signal.aborted) {
      console.warn("Palette sync timed out; stopping early");
      break;
    }

    if (i > 0) await sleep(3000);

    const slug = emptyKeys[i];
    try {
      const res = await fetch(`https://lospec.com/palette-list/${slug}.json`, {
        signal,
      });
      if (res.ok) {
        const data = await res.text();
        await env.LOSPEC_PALETTES.put(slug, data);
        console.log(`✓ ${slug}`);
      } else {
        console.warn(`✗ ${slug} (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error(`✗ ${slug} (error):`, err);
    }
  }

  console.log("Palette sync complete");
}

// ─── Worker Export ───────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const signal = AbortSignal.timeout(15 * 60 * 1000); // 15 minutes
    ctx.waitUntil(syncPalettes(env, signal));
  },
};
