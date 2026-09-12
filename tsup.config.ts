import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: "dist",
  },
  {
    entry: { overturo: "src/index.ts" },
    format: ["iife"],
    globalName: "Overturo",
    minify: true,
    outDir: "dist",
    footer: {
      js: "if(typeof window!=='undefined'){window.Overturo=Overturo.Overturo||Overturo}",
    },
  },
]);
