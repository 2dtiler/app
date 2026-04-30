/// <reference types="vitest/config" />

import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const manualChunkPackages = [
  ["react-vendor", ["react", "react-dom"]],
  [
    "radix-ui",
    [
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-slot",
    ],
  ],
  ["sentry", ["@sentry/react"]],
  ["db", ["dexie", "dexie-react-hooks"]],
  ["gif", ["gifenc"]],
  ["color", ["color"]],
  ["panels", ["react-resizable-panels"]],
] as const;

function getManualChunk(id: string) {
  for (const [chunkName, packages] of manualChunkPackages) {
    for (const packageName of packages) {
      if (
        id.includes(`/node_modules/${packageName}/`) ||
        id.endsWith(`/node_modules/${packageName}`)
      ) {
        return chunkName;
      }
    }
  }

  return null;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "2D Tiler",
        short_name: "2D Tiler",
        description: "A 2D tile map editor",
        theme_color: "#1e293b",
        background_color: "#1e293b",
        display: "standalone",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        skipWaiting: true,
      },
    }),
  ],
  server: {
    proxy: {},
    headers: {
      "Strict-Transport-Security":
        "max-age=63072000; includeSubDomains; preload",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=()",
      "Content-Security-Policy":
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' https://o4510891797250048.ingest.us.sentry.io https://*.sentry.io https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://www.google.com; " +
        "worker-src 'self' blob:; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " +
        "upgrade-insecure-requests",
    },
  },
  build: {
    sourcemap: process.env.VITE_ENABLE_SOURCE_MAPS === "true",
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
