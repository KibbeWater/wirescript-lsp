# Wirescript (`.wcode`) for Neovim

Syntax highlighting and IntelliSense for `.wcode` in Neovim (0.9+).

- **Highlighting**: a tree-sitter grammar (semantic, recommended) with a
  zero-build `syntax/wcode.vim` regex fallback.
- **Autocomplete / hover / diagnostics**: the shared `wcode-language-server`
  (the same one the VS Code extension uses) via Neovim's built-in LSP client.

## Requirements

- Highlighting fallback: none (works immediately).
- Tree-sitter highlighting: `nvim-treesitter` + a C compiler (to build the parser).
- LSP features: Node.js, and the built server at
  `packages/server/out/server.js` (run `npm install && npm run build` in the
  repo root once).
- Live diagnostics: the `wiremod-scheme` binary on `PATH` (or set `compiler_path`).

## Install

### lazy.nvim

```lua
{
  -- point dir/url at this repo's editors/nvim folder
  dir = "/path/to/wirescript/editors/nvim",
  ft = "wcode",
  config = function()
    require("wcode").setup({
      -- server_path  = "/path/to/wirescript/packages/server/out/server.js", -- auto-detected if omitted
      compiler_path = "wiremod-scheme",   -- for live diagnostics
      diagnostics_run = "onSave",          -- or "onType"
    })
  end,
}
```

### packer.nvim

```lua
use({
  "/path/to/wirescript/editors/nvim",
  config = function() require("wcode").setup({}) end,
})
```

## Tree-sitter parser

After `setup()` has registered the parser config, build it once:

```vim
:TSInstall wcode
```

The highlight/locals queries ship in `queries/wcode/` and are picked up from
this plugin's runtimepath automatically.

## `setup()` options

| option | default | meaning |
|---|---|---|
| `server_path` | `…/packages/server/out/server.js` | path to the built LSP server |
| `server_cmd` | `{ "node", server_path, "--stdio" }` | full launch command override |
| `compiler_path` | `wiremod-scheme` | the compiler used for live diagnostics |
| `diagnostics` | `true` | enable LSP diagnostics |
| `diagnostics_run` | `onSave` | `onSave` or `onType` |
| `treesitter` | `true` | register the tree-sitter parser config |
| `lsp` | `true` | start the language server |

Completion uses the standard LSP client. Pair it with a completion engine
(`nvim-cmp`, `blink.cmp`, or built-in `<C-x><C-o>` omnifunc) to see suggestions.
