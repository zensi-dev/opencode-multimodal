import { defineConfig } from "tsup"

// Two entry points so a single package can expose both a server plugin
// (hooks that run in the opencode backend) and a TUI plugin (the /multimodal
// config UI that runs in the renderer). opencode resolves them via the
// package.json `exports["./server"]` and `exports["./tui"]` entries, and a
// single module is not allowed to export both `server` and `tui`.
export default defineConfig({
  entry: {
    server: "src/server/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // Host-provided packages: resolved by opencode at runtime.
  external: [
    "@opencode-ai/plugin",
    "@opencode-ai/sdk",
    "@opentui/core",
    "@opentui/solid",
    "@opentui/keymap",
    "solid-js",
    "node:crypto",
    "node:fs",
    "node:path",
    "node:os",
    "node:url",
  ],
  esbuildOptions() {
    // @ai-sdk/* provider packages are loaded with dynamic import(variable) at
    // runtime; esbuild cannot statically resolve a variable import, so those
    // packages never enter the bundle graph — no external regex needed.
  },
})
