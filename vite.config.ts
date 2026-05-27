import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/lm-studio-proxy": {
        target: "http://localhost:1234",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lm-studio-proxy/, ""),
      },
      "/ollama-proxy": {
        target: "http://localhost:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama-proxy/, ""),
      },
      "/comfyui-proxy": {
        target: "http://127.0.0.1:8188",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/comfyui-proxy/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
});
