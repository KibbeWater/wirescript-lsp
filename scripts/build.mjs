// Build orchestration for the wirescript editor tooling.
//
//   node scripts/build.mjs            one-shot build (server + vscode extension)
//   node scripts/build.mjs --watch    rebuild on change
//   node scripts/build.mjs --clean    remove build output
//
// The LSP server is bundled to a single self-contained file so Neovim and
// JetBrains can run it directly with `node`. The VS Code extension is bundled
// separately (with `vscode` left external) and gets its own copy of the server
// bundle plus the shared grammar/config/snippets so it works standalone.

import { context, build } from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
const clean = process.argv.includes("--clean");

const serverOut = join(root, "packages/server/out");
const vscodeOut = join(root, "packages/vscode/out");
const vscodeDir = join(root, "packages/vscode");
const jetbrainsDir = join(root, "editors/jetbrains/textmate");

if (clean) {
  for (const p of [serverOut, vscodeOut]) rmSync(p, { recursive: true, force: true });
  for (const p of ["syntaxes", "snippets", "language-configuration.json"])
    rmSync(join(vscodeDir, p), { recursive: true, force: true });
  for (const p of ["wcode.tmLanguage.json", "language-configuration.json"])
    rmSync(join(jetbrainsDir, p), { recursive: true, force: true });
  console.log("cleaned build output");
  process.exit(0);
}

/** Common esbuild options for a Node CommonJS bundle. */
const common = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
};

const serverOpts = {
  ...common,
  entryPoints: [join(root, "packages/server/src/server.ts")],
  outfile: join(serverOut, "server.js"),
};

const vscodeOpts = {
  ...common,
  entryPoints: [join(root, "packages/vscode/src/extension.ts")],
  outfile: join(vscodeOut, "extension.js"),
  external: ["vscode"], // provided by the VS Code runtime
};

/** Copy the shared assets the VS Code extension ships with. */
function copyShared() {
  mkdirSync(vscodeOut, { recursive: true });
  // The server bundle the extension launches.
  cpSync(join(serverOut, "server.js"), join(vscodeOut, "server.js"));
  if (existsSync(join(serverOut, "server.js.map")))
    cpSync(join(serverOut, "server.js.map"), join(vscodeOut, "server.js.map"));
  // Grammar / language-config / snippets contributed by package.json.
  cpSync(join(root, "syntaxes"), join(vscodeDir, "syntaxes"), { recursive: true });
  cpSync(join(root, "snippets"), join(vscodeDir, "snippets"), { recursive: true });
  cpSync(join(root, "language-configuration.json"), join(vscodeDir, "language-configuration.json"));

  // The JetBrains TextMate bundle reuses the same grammar + language config.
  mkdirSync(jetbrainsDir, { recursive: true });
  cpSync(join(root, "syntaxes/wcode.tmLanguage.json"), join(jetbrainsDir, "wcode.tmLanguage.json"));
  cpSync(join(root, "language-configuration.json"), join(jetbrainsDir, "language-configuration.json"));
}

if (watch) {
  const sCtx = await context(serverOpts);
  const vCtx = await context(vscodeOpts);
  await sCtx.rebuild();
  await vCtx.rebuild();
  copyShared();
  await Promise.all([sCtx.watch(), vCtx.watch()]);
  console.log("watching for changes… (Ctrl-C to stop)");
} else {
  await build(serverOpts);
  await build(vscodeOpts);
  copyShared();
  console.log("build complete");
}
