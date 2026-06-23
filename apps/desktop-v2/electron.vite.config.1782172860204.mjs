// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "C:\\Users\\Henson\\Desktop\\projects\\biztrack-cm\\apps\\desktop-v2";
var devImageCspPlugin = {
  name: "biztrack-dev-image-csp",
  apply: "serve",
  transformIndexHtml(html) {
    return html.replace(
      "img-src 'self' data: https:",
      "img-src 'self' data: https: http://localhost:* http://127.0.0.1:*"
    );
  }
};
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/main/index.ts") }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts") }
      }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@biztrack/types": resolve(__electron_vite_injected_dirname, "../../packages/types/src"),
        "@biztrack/utils": resolve(__electron_vite_injected_dirname, "../../packages/utils/src"),
        "@biztrack/templates": resolve(__electron_vite_injected_dirname, "../../packages/templates/src"),
        "@biztrack/ui/styles.css": resolve(__electron_vite_injected_dirname, "../../packages/ui/src/styles/biztrack.css"),
        "@biztrack/ui/biztrack": resolve(__electron_vite_injected_dirname, "../../packages/ui/src/biztrack/index.ts")
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html") }
      }
    },
    plugins: [react(), devImageCspPlugin]
  }
});
export {
  electron_vite_config_default as default
};
