# Wirescript (`.wcode`) for VS Code

Syntax highlighting and IntelliSense for [`.wcode`](../../README.md) — the
strictly-typed language that compiles to s&box Wiremod schematics.

## Features

- **Syntax highlighting** via a TextMate grammar (`source.wcode`).
- **Autocomplete** powered by the shared `wcode-language-server`:
  - device ports after `.` (`pot.total_amount`, `mem.store`),
  - port attributes after `@` (`@scanner`, `@screen`, …),
  - construct parameters and enum values inside `Construct( … )`,
  - test DSL (`beam`, `tick`, …) and `#expect` / `try #require` inside `@Test` bodies,
  - wire types after `:` / `->`,
  - in-scope symbols (inputs, outputs, lets, funcs, devices).
- **Hover** docs for keywords, types, attributes, constructs, ports and builtins.
- **Outline / document symbols** for sections, ports, funcs and devices.
- **Live diagnostics** from the real compiler (`wiremod-scheme validate`).
- **Commands**: *Validate File*, *Run @Test Suite*, *Show Wiring Graph*.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `wcode.compilerPath` | `wiremod-scheme` | Path to the compiler binary (for diagnostics + commands). |
| `wcode.diagnostics.enable` | `true` | Toggle live compiler diagnostics. |
| `wcode.diagnostics.run` | `onSave` | `onSave` or `onType`. |

If the compiler isn't found, diagnostics quietly disable themselves (everything
else still works); set `wcode.compilerPath` to re-enable.

## Develop / run from source

From the repository root:

```sh
npm install
npm run build
```

Then open **this** folder (`packages/vscode`) in VS Code and press **F5** to
launch an Extension Development Host with the extension loaded. Open
`../../examples/sample.wcode` to try it.

## Package a VSIX

```sh
npm run build
cd packages/vscode
npx --yes @vscode/vsce package --no-dependencies
```
