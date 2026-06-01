# Wirescript (`.wcode`) for JetBrains IDEs

JetBrains support is intentionally lightweight: it reuses the **shared TextMate
grammar** for highlighting and the **shared language server** for completion,
hover and diagnostics (via the LSP4IJ plugin). No native plugin is required.

> Works in IntelliJ IDEA, CLion, Rider, PyCharm, WebStorm, etc. (2023.2+).

## 1. Build the shared assets

From the repository root:

```sh
npm install
npm run build
```

This populates `editors/jetbrains/textmate/` with `wcode.tmLanguage.json` and
`language-configuration.json` (copied from the shared sources) and builds the
language server at `packages/server/out/server.js`.

## 2. Syntax highlighting — import the TextMate bundle

1. **Settings / Preferences → Editor → TextMate Bundles**.
2. Click **+** and select the `editors/jetbrains/textmate` folder.
3. Apply. `.wcode` files now highlight using the `source.wcode` grammar.

## 3. Completion + diagnostics — LSP4IJ

1. Install the **LSP4IJ** plugin (Settings → Plugins → Marketplace → "LSP4IJ").
2. **Settings → Languages & Frameworks → Language Servers → +**.
   - **Name**: `Wirescript`
   - **Command**:
     ```
     node /absolute/path/to/wirescript/packages/server/out/server.js --stdio
     ```
   - **Mappings → File name patterns**: `*.wcode` with language id `wcode`.
3. (Optional) Pass settings as JSON in the *Configuration* tab so diagnostics
   find your compiler:
   ```json
   { "wcode": { "compilerPath": "wiremod-scheme", "diagnostics": { "enable": true, "run": "onSave" } } }
   ```
4. Open a `.wcode` file — completion, hover, document symbols and live compiler
   diagnostics now work.

## Notes

- The TextMate grammar and the LSP are the same artifacts the VS Code extension
  uses, so behavior matches across editors.
- If you later want a fully native plugin (custom lexer/PSI, gutter actions),
  that can be layered on top — out of scope for this iteration.
