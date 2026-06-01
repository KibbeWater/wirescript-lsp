// Hover documentation: resolve the word under the cursor against the catalog
// and the document symbol model.

import { Hover, MarkupKind, Position, Range } from "vscode-languageserver";

import {
  catalog,
  findInputAttr,
  findOutputAttr,
  findMacro,
  getConstruct,
  getDsl,
  isGateOp,
  isKeyword,
  isType,
} from "./catalog";
import { DocModel, findSym } from "./symbols";
import { charBefore, wordAt } from "./scanner";

function hover(value: string, range: Range): Hover {
  return { contents: { kind: MarkupKind.Markdown, value }, range };
}

function constructDoc(name: string): string {
  const c = getConstruct(name)!;
  const params = c.params.map((p) => `${p.name}:`).join(", ");
  const outs = c.outputs.map((o) => `${o.name}: ${o.type}`).join(", ") || "—";
  const ins = c.inputs.map((i) => `${i.name}: ${i.type}`).join(", ") || "—";
  return [
    `**${c.name}**(${params}) — construct`,
    "",
    c.doc,
    "",
    `*outputs:* ${outs}`,
    `*inputs:* ${ins}`,
  ].join("\n");
}

export function provideHover(model: DocModel, line: string, pos: Position): Hover | null {
  const w = wordAt(line, pos.character);
  if (!w) return null;
  const range = Range.create(pos.line, w.start, pos.line, w.end);
  const sigil = charBefore(line, w.start);

  // member port: base.port
  if (sigil === ".") {
    const head = line.slice(0, w.start - 1);
    const bm = /([A-Za-z_]\w*)\s*$/.exec(head);
    const ctorName = bm && model.devices.get(bm[1]);
    if (ctorName) {
      const c = getConstruct(ctorName)!;
      const out = c.outputs.find((o) => o.name === w.word);
      const inp = c.inputs.find((i) => i.name === w.word);
      const port = out ?? inp;
      if (port) {
        const dir = out ? "output" : "input";
        return hover(
          `\`${w.word}: ${port.type}\` — ${c.name} ${dir}${port.doc ? `\n\n${port.doc}` : ""}`,
          range,
        );
      }
    }
    return null;
  }

  // @attribute
  if (sigil === "@") {
    if (w.word === catalog.testAttribute.name)
      return hover(`**@Test** — \`${catalog.testAttribute.signature}\`\n\n${catalog.testAttribute.doc}`, range);
    const a = findInputAttr(w.word) ?? findOutputAttr(w.word);
    if (a) return hover(`**@${a.name}** — backs the port with a \`${a.construct}\`.\n\n${a.doc}`, range);
    return null;
  }

  // #macro
  if (sigil === "#") {
    const m = findMacro(w.word);
    if (m) return hover(`**#${m.name}** — \`${m.signature}\`\n\n${m.doc}`, range);
    return null;
  }

  // construct name
  if (getConstruct(w.word)) return hover(constructDoc(w.word), range);

  // keyword
  if (isKeyword(w.word)) {
    const doc = catalog.keywordDocs[w.word];
    return hover(`**${w.word}** — keyword${doc ? `\n\n${doc}` : ""}`, range);
  }

  // wire type
  if (isType(w.word)) {
    const doc = catalog.typeDocs[w.word];
    return hover(`**${w.word}** — wire type${doc ? `\n\n${doc}` : ""}`, range);
  }

  // boolean literal
  if (catalog.booleans.includes(w.word)) return hover(`**${w.word}** — boolean literal`, range);

  // DSL builtin
  const dsl = getDsl(w.word);
  if (dsl) return hover(`**${dsl.name}** — \`${dsl.signature}\`\n\n${dsl.doc}`, range);

  // gate operation (inside a `type:` argument)
  if (isGateOp(w.word) && /\btype\s*:\s*$/.test(line.slice(0, w.start)))
    return hover(`**${w.word}** — Gate operation`, range);

  // world declaration keyword
  const world = catalog.worldDecls.find((d) => d.name === w.word);
  if (world && /^\s*$/.test(line.slice(0, w.start)))
    return hover(`**${world.name}** — \`${world.signature}\`\n\n${world.doc}`, range);

  // user symbol
  const sym = findSym(model, w.word);
  if (sym) {
    const head =
      sym.kind === "device"
        ? `\`${sym.name}\` — ${sym.construct} device`
        : sym.kind === "func"
          ? `\`${sym.type ?? sym.detail}\``
          : `\`${sym.detail}\``;
    return hover(`${head}`, range);
  }

  return null;
}
