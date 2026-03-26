import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { mochaPlugins } from "@getmocha/vite-plugins";

const enableCloudflare = process.env.ENABLE_CLOUDFLARE === "1";

export default defineConfig({
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mochaPlugins(process.env as any),
    react(),
    ...(enableCloudflare
      ? [
          cloudflare({
            auxiliaryWorkers: [{ configPath: "/mocha/emails-service/wrangler.json" }],
          }),
        ]
      : []),
  ],
  server: {
    allowedHosts: true,
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
