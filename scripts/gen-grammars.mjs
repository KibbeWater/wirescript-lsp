// Keep the highlight queries in sync with the canonical language data and copy
// the tree-sitter queries into the Neovim plugin.
//
//   node scripts/gen-grammars.mjs          sync + validate (exits 1 on drift)
//
// The grammar deliberately does NOT reserve construct / type / builtin / gate-op
// names (they are ordinary identifiers in the real lexer), so highlighting keys
// off name lists in queries/highlights.scm. This script asserts those lists
// still cover everything in data/wcode-language.json.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/wcode-language.json"), "utf8"));

const tsHighlights = join(root, "tree-sitter-wcode/queries/highlights.scm");
const tsLocals = join(root, "tree-sitter-wcode/queries/locals.scm");
const nvimDir = join(root, "editors/nvim/queries/wcode");

// 1. Validate: every catalog name must appear in the tree-sitter highlights.
const hl = readFileSync(tsHighlights, "utf8");
const expected = [
  ...data.constructs.map((c) => c.name),
  ...data.gateOps,
  ...data.dslBuiltins.map((b) => b.name),
  ...data.types,
];
const missing = [...new Set(expected)].filter((name) => !hl.includes(`"${name}"`));
if (missing.length) {
  console.error(`drift: queries/highlights.scm is missing names from data/wcode-language.json:\n  ${missing.join(", ")}`);
  process.exit(1);
}

// 2. Sync: copy the tree-sitter queries into the Neovim plugin runtimepath.
mkdirSync(nvimDir, { recursive: true });
const banner = (file) => `; AUTO-SYNCED from tree-sitter-wcode/queries/${file} by scripts/gen-grammars.mjs — do not edit here.\n`;
writeFileSync(join(nvimDir, "highlights.scm"), banner("highlights.scm") + hl);
writeFileSync(join(nvimDir, "locals.scm"), banner("locals.scm") + readFileSync(tsLocals, "utf8"));

console.log(`grammars in sync — ${expected.length} catalog names verified; Neovim queries updated.`);
