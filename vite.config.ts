import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      manifest: {
        name: "2D Tiler",
        short_name: "2D Tiler",
        description: "A 2D tile map editor",
        theme_color: "#1e293b",
        background_color: "#1e293b",
        display: "standalone",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
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
        "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://static.cloudflareinsights.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "connect-src 'self' https://o4510891797250048.ingest.us.sentry.io https://*.sentry.io https://www.google.com https://cloudflareinsights.com; " +
        "frame-src https://www.google.com; " +
        "worker-src 'self' blob:; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " +
        "upgrade-insecure-requests",
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "radix-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-slot",
          ],
          sentry: ["@sentry/react"],
          db: ["dexie", "dexie-react-hooks"],
          gif: ["gifenc"],
          color: ["color"],
          panels: ["react-resizable-panels"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
