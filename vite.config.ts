import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "PG Inventory",
        short_name: "PGInventory",
        description: "Home/PG inventory, barcode & bill scanning",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Camera-driven scanning needs a live network call each time (Gemini,
        // Open Food Facts) — we deliberately don't cache API responses, only
        // the app shell, so scans never silently serve stale data offline.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  server: {
    host: true, // so you can open it from your phone on the same LAN via https://<your-ip>:5173
  },
});
