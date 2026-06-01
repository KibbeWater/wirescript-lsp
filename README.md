# Wirescript editor tooling

Syntax highlighting and autocomplete for **`.wcode`** — the strictly-typed,
Swift-flavored language that compiles to s&box Wiremod schematics. The language
and its compiler live in the separate [`wiremod-scheme`](../../CLionProjects/wiremod-scheme)
Rust project; this repo is the editor support for **Neovim**, **VS Code** and
**JetBrains**.

## Architecture

One **language server** is the brain for completion, hover, document symbols and
diagnostics; each editor adds its own syntax highlighting and a thin client.

```
            data/wcode-language.json   ← single source of truth (keywords, types,
                       │                  attrs, builtins, 18 constructs + ports)
        ┌──────────────┼───────────────────────────┐
        ▼              ▼                            ▼
  packages/server   syntaxes/wcode.tmLanguage   tree-sitter-wcode/
  (LSP: complete,   (TextMate highlighting)     (semantic highlighting)
   hover, symbols,        │         │                  │
   diagnostics via        │         │                  │
   `wiremod-scheme        ▼         ▼                  ▼
    validate`)        VS Code   JetBrains           Neovim
                      (client)  (TextMate+LSP4IJ)   (LSP + TS + vim-syntax)
```

- **Highlighting**: a shared TextMate grammar (VS Code + JetBrains) and a
  tree-sitter grammar + `syntax/wcode.vim` fallback (Neovim).
- **Autocomplete / hover / diagnostics**: the shared `wcode-language-server`
  (TypeScript/Node), spoken over stdio so every editor reuses it.
- **Live diagnostics**: the server runs `wiremod-scheme validate <file>` and maps
  its `path:line:col: error[CODE]: message` output to editor squiggles. It
  auto-disables if the compiler isn't found; set `wcode.compilerPath` to enable.

## Layout

| Path | What |
|---|---|
| `data/wcode-language.json` | Canonical language description (keywords, types, attrs, builtins, constructs). |
| `syntaxes/`, `language-configuration.json`, `snippets/` | Shared TextMate grammar, language config, snippets. |
| `packages/server/` | The language server. |
| `packages/vscode/` | The VS Code extension (ships the server). |
| `tree-sitter-wcode/` | tree-sitter grammar + highlight queries. |
| `editors/nvim/` | Neovim plugin (ftdetect, ftplugin, syntax fallback, queries, LSP setup). |
| `editors/jetbrains/` | TextMate bundle + LSP4IJ setup docs. |
| `examples/sample.wcode` | Feature showcase for manual testing. |
| `scripts/` | Build (`build.mjs`) and grammar sync/validate (`gen-grammars.mjs`). |

## Build

Requires Node.js 18+.

```sh
npm install
npm run build          # bundles the server + VS Code extension, copies shared assets
npm run typecheck      # optional: type-check the TypeScript packages
node scripts/gen-grammars.mjs   # validate + sync highlight queries
```

For live diagnostics, build the compiler in the `wiremod-scheme` project
(`cargo build --release`) and put `wiremod-scheme` on your `PATH` (or set
`wcode.compilerPath`).

## Per-editor setup

- **VS Code** — [`packages/vscode/README.md`](packages/vscode/README.md). Open
  that folder and press **F5**, or package a VSIX.
- **Neovim** — [`editors/nvim/README.md`](editors/nvim/README.md). Add the dir
  to your plugin manager and call `require('wcode').setup{}`.
- **JetBrains** — [`editors/jetbrains/README.md`](editors/jetbrains/README.md).
  Import the TextMate bundle and wire the server through LSP4IJ.

## The `.wcode` language at a glance

```swift
module hilo
input dealer: Number @scanner
let mem = Memory()
[Name="Resolve"] {
  output multiplier: Number @screen = dealer >= 7 ? 2.0 : 1.0
}
@Test("base", arguments: [(7, 2.0)])
func t(d: Number, m: Number) { beam(dealer, 5, d); tick(3); #expect(multiplier == m) }
```

See the language docs in the `wiremod-scheme` project (`docs/wcode.md`).
