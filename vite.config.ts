/// <reference types="vitest/config" />

import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const manualChunkPackages = [
  ["react-vendor", ["react", "react-dom"]],
  ["icons", ["lucide-react"]],
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
  ["editor-state", ["travels", "mutative", "uuid"]],
  ["archive", ["@msgpack/msgpack", "fflate"]],
  ["gif", ["gifenc"]],
  ["color", ["color"]],
  ["panels", ["react-resizable-panels"]],
] as const;

const manualChunkPaths = [
  [
    "import-export-project-importers",
    [
      "/src/features/import-export/hooks/use-godot-project-import.ts",
      "/src/features/import-export/hooks/use-tiled-project-import.ts",
      "/src/features/import-export/lib/godot-project-action-utils.ts",
      "/src/features/import-export/lib/godot-project-warning-utils.ts",
      "/src/features/import-export/lib/import-export-godot-project.ts",
      "/src/features/import-export/lib/import-export-tiled-project.ts",
      "/src/features/import-export/lib/imported-godot-project-session.ts",
      "/src/features/import-export/lib/imported-tiled-project-session.ts",
      "/src/features/import-export/lib/tiled-project-action-utils.ts",
    ],
  ],
  [
    "import-export-engine-importers",
    [
      "/src/features/import-export/hooks/use-defold-map-import.ts",
      "/src/features/import-export/hooks/use-defold-tileset-import.ts",
      "/src/features/import-export/hooks/use-gamemaker-map-import.ts",
      "/src/features/import-export/hooks/use-godot-map-import.ts",
      "/src/features/import-export/hooks/use-godot-tileset-import.ts",
      "/src/features/import-export/hooks/use-mappy-map-import.ts",
      "/src/features/import-export/hooks/use-tide-map-import.ts",
      "/src/features/import-export/hooks/use-tiled-map-import.ts",
      "/src/features/import-export/hooks/use-tiled-tileset-import.ts",
      "/src/features/import-export/hooks/use-unity-map-import.ts",
      "/src/features/import-export/hooks/use-unity-tileset-import.ts",
      "/src/features/import-export/lib/defold-",
      "/src/features/import-export/lib/gamemaker-",
      "/src/features/import-export/lib/godot-import-helpers.ts",
      "/src/features/import-export/lib/godot-map-",
      "/src/features/import-export/lib/godot-scene-utils.ts",
      "/src/features/import-export/lib/godot-terrain.ts",
      "/src/features/import-export/lib/godot-tileset-",
      "/src/features/import-export/lib/import-export-defold.ts",
      "/src/features/import-export/lib/import-export-gamemaker.ts",
      "/src/features/import-export/lib/import-export-godot-tileset.ts",
      "/src/features/import-export/lib/import-export-godot.ts",
      "/src/features/import-export/lib/import-export-mappy.ts",
      "/src/features/import-export/lib/import-export-tide.ts",
      "/src/features/import-export/lib/import-export-tiled-json.ts",
      "/src/features/import-export/lib/import-export-tiled-lua.ts",
      "/src/features/import-export/lib/import-export-tiled-shared.ts",
      "/src/features/import-export/lib/import-export-tiled.ts",
      "/src/features/import-export/lib/import-export-unity-tileset.ts",
      "/src/features/import-export/lib/import-export-unity.ts",
      "/src/features/import-export/lib/mappy-",
      "/src/features/import-export/lib/tide-",
      "/src/features/import-export/lib/tiled-animation-conversion.ts",
      "/src/features/import-export/lib/tiled-lua",
      "/src/features/import-export/lib/tiled-map-",
      "/src/features/import-export/lib/tiled-tileset-",
      "/src/features/import-export/lib/tiled-wang.ts",
      "/src/features/import-export/lib/tiled-xml-utils.ts",
      "/src/features/import-export/lib/unity-",
    ],
  ],
  [
    "import-export-runtime",
    [
      "/src/features/import-export/hooks/",
      "/src/features/import-export/lib/",
      "/src/features/import-export/components/QuickExportButtonGroup.tsx",
      "/src/utils/format.ts",
    ],
  ],
  [
    "map-editor-map-panel",
    [
      "/src/features/map-editor/components/MapPanel/",
      "/src/features/map-editor/components/MapPanel.tsx",
      "/src/features/map-editor/components/MapCanvas/",
      "/src/features/map-editor/hooks/use-text-object-editing.ts",
      "/src/hooks/use-canvas-navigation.ts",
    ],
  ],
  [
    "map-editor-tileset",
    [
      "/src/features/map-editor/components/TilesetPanel/",
      "/src/features/map-editor/components/TilesetPanel.tsx",
      "/src/features/map-editor/components/TilesetCanvas.tsx",
      "/src/features/map-editor/components/TilesetToolbar.tsx",
      "/src/features/map-editor/components/animations/",
      "/src/features/map-editor/components/autotile/",
      "/src/features/map-editor/hooks/use-tileset-image-import.ts",
    ],
  ],
  [
    "map-editor-workspace",
    [
      "/src/features/map-editor/components/LayersPanel/",
      "/src/features/map-editor/components/LayersPanel.tsx",
      "/src/features/map-editor/components/ObjectsPanel.tsx",
      "/src/features/map-editor/components/ImageLayerPropertiesPanel.tsx",
      "/src/features/map-editor/components/Layout/",
    ],
  ],
] as const;

function getManualChunk(id: string) {
  for (const [chunkName, paths] of manualChunkPaths) {
    for (const segment of paths) {
      if (id.includes(segment)) {
        return chunkName;
      }
    }
  }

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
        "connect-src 'self' https://o4510891797250048.ingest.us.sentry.io https://*.sentry.io https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://www.google.com https://api.2dtiler.com; " +
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
    fileParallelism: true,
    maxWorkers: "100%",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      exclude: [
        "src/**/*.tsx",
        "src/features/import-export/lib/import-export-godot-project.ts",
        "src/features/import-export/lib/import-export-mappy.ts",
        "src/features/import-export/lib/import-export-tiled-lua.ts",
        "src/features/import-export/lib/godot-tileset-import.ts",
        "src/features/import-export/lib/tiled-lua.ts",
        "src/features/import-export/lib/unity-tileset-import.ts",
        "src/features/import-export/hooks/use-tiled-project-import.ts",
        "src/features/map-editor/hooks/use-tileset-image-import.ts",
        "src/features/map-editor/lib/autotile-dialog.ts",
      ],
      thresholds: {
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
