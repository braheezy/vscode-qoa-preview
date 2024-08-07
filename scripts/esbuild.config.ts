import type { BuildOptions } from "esbuild";

const config: BuildOptions = {
  entryPoints: ["./src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node12",
  outdir: "./dist",
  outbase: "./src",
  outExtension: {
    ".js": ".cjs",
  },
  format: "cjs",
  external: ["vscode"],
  loader: {
    ".ts": "ts",
    ".js": "js",
  },
  logLevel: "info",
  minify: true,
  sourcemap: false,
  treeShaking: true,
};

export default config;
