import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app talks to GenLayer through a same-origin /api/rpc path. In production
// Netlify rewrites that to the Bradbury RPC (see netlify.toml). In local dev we
// proxy it here so the two environments behave identically.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/rpc": {
        target: "https://rpc-bradbury.genlayer.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/rpc/, ""),
      },
    },
  },
});
