# tree-sitter-wcode

A [tree-sitter](https://tree-sitter.github.io/) grammar for the `.wcode`
wirescript language. Powers semantic syntax highlighting in Neovim (and any
other tree-sitter host).

## Build

```sh
npm install            # installs tree-sitter-cli
npm run generate       # writes src/parser.c from grammar.js
npm run parse -- ../examples/sample.wcode   # smoke test: should print a tree with no (ERROR ...)
npm test               # runs test/corpus (if present)
```

## Use from Neovim

The companion plugin in [`../editors/nvim`](../editors/nvim) wires this up for
you via `require('wcode').setup()`. To register it manually with
`nvim-treesitter`:

```lua
local parser_config = require('nvim-treesitter.parsers').get_parser_configs()
parser_config.wcode = {
  install_info = {
    url = '/absolute/path/to/wirescript/tree-sitter-wcode', -- or a git URL
    files = { 'src/parser.c' },
    branch = 'main',
  },
  filetype = 'wcode',
}
```

Then `:TSInstall wcode`. Copy `queries/*.scm` to
`~/.config/nvim/queries/wcode/` (the nvim plugin ships a mirror already).

## Notes

- The reserved keyword set matches `wiremod-scheme/src/wcode/token.rs`.
- Construct names, wire types, gate operations and test DSL builtins are
  ordinary identifiers in the real lexer, so they are highlighted by
  `queries/highlights.scm` (`#any-of?` lists), not reserved in the grammar.
  Those lists mirror `../data/wcode-language.json`.
