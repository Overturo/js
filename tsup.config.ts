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
  // 202 D13 — the embedded consent field: its own entry, loaded explicitly
  // beside the core (never a hidden dynamic import). Appended AFTER the
  // first config, whose `clean: true` would otherwise wipe these outputs.
  {
    entry: { "field/index": "src/field/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    outDir: "dist",
  },
  {
    entry: { "overturo-field": "src/field/index.ts" },
    format: ["iife"],
    globalName: "OverturoField",
    minify: true,
    outDir: "dist",
    footer: {
      js: "if(typeof window!=='undefined'){window.OverturoField=OverturoField.ConsentFieldElement?OverturoField:OverturoField}",
    },
  },
]);
