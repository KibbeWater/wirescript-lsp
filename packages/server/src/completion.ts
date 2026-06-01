// Context-aware completion for .wcode. The cursor context is classified from
// the line prefix, then the matching set of completions is produced from the
// catalog and the document symbol model.

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  Position,
} from "vscode-languageserver";

import {
  catalog,
  Construct,
  getConstruct,
  Param,
  Port,
  paramEnumValues,
} from "./catalog";
import { DocModel, Sym } from "./symbols";
import { getPrefix } from "./scanner";

function md(value: string) {
  return { kind: MarkupKind.Markdown, value };
}

function snippet(label: string, insert: string, kind: CompletionItemKind, opts: Partial<CompletionItem> = {}): CompletionItem {
  return { label, kind, insertText: insert, insertTextFormat: InsertTextFormat.Snippet, ...opts };
}

function plain(label: string, kind: CompletionItemKind, opts: Partial<CompletionItem> = {}): CompletionItem {
  return { label, kind, ...opts };
}

// ---- context detection ------------------------------------------------------

/** Find the construct call the cursor is inside, plus the param being valued. */
function constructCallContext(before: string): { construct: Construct; enumParam?: string } | null {
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const c = before[i];
    if (c === ")") depth++;
    else if (c === "(") {
      if (depth === 0) {
        const head = before.slice(0, i);
        const m = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(head);
        const ctor = m && getConstruct(m[1]);
        if (!ctor) return null;
        const seg = before.slice(i + 1);
        const pm = /([A-Za-z_]\w*)\s*:\s*[A-Za-z0-9_."]*$/.exec(seg);
        return { construct: ctor, enumParam: pm ? pm[1] : undefined };
      }
      depth--;
    }
  }
  return null;
}

// ---- completion sets --------------------------------------------------------

function portItem(port: Port, dir: "input" | "output", ctor: Construct, writeTarget: boolean): CompletionItem {
  const priority = writeTarget === (dir === "input") ? "0" : "1";
  return plain(port.name, CompletionItemKind.Field, {
    detail: `${port.name}: ${port.type} — ${ctor.name} ${dir}`,
    documentation: port.doc ? md(port.doc) : undefined,
    sortText: priority + port.name,
  });
}

function memberCompletions(ctor: Construct, before: string): CompletionItem[] {
  // `base.port` at the very start of a statement is almost always a wiring
  // write (`device.port = expr`), so prioritize input ports there.
  const writeTarget = /^\s*[A-Za-z_]\w*\s*\.\s*\w*$/.test(before);
  const items: CompletionItem[] = [];
  for (const o of ctor.outputs) items.push(portItem(o, "output", ctor, writeTarget));
  for (const i of ctor.inputs) items.push(portItem(i, "input", ctor, writeTarget));
  return items;
}

function attrCompletions(line: string): CompletionItem[] {
  const trimmed = line.trimStart();
  const onInput = /^input\b/.test(trimmed);
  const onOutput = /^output\b/.test(trimmed);
  const items: CompletionItem[] = [];
  const add = (name: string, doc: string) =>
    items.push(plain(name, CompletionItemKind.EnumMember, { detail: "port attribute", documentation: md(doc) }));

  if (onInput) catalog.inputAttrs.forEach((a) => add(a.name, a.doc));
  else if (onOutput) catalog.outputAttrs.forEach((a) => add(a.name, a.doc));
  else {
    catalog.inputAttrs.forEach((a) => add(a.name, a.doc));
    catalog.outputAttrs.forEach((a) => add(a.name, a.doc));
    items.push(
      snippet(catalog.testAttribute.name, 'Test("$1", arguments: [$2])$0', CompletionItemKind.Function, {
        detail: catalog.testAttribute.signature,
        documentation: md(catalog.testAttribute.doc),
      }),
    );
  }
  return items;
}

function macroCompletions(before: string): CompletionItem[] {
  const afterTry = /\btry\s+#\w*$/.test(before);
  const items: CompletionItem[] = [];
  for (const m of catalog.testMacros) {
    if (m.name === "require" && !afterTry) continue; // `require` only follows `try`
    items.push(
      snippet(m.name, `${m.name}($1)$0`, CompletionItemKind.Function, {
        detail: m.signature,
        documentation: md(m.doc),
      }),
    );
  }
  return items;
}

function paramCompletions(ctor: Construct): CompletionItem[] {
  return ctor.params.map((p) =>
    snippet(p.name, `${p.name}: $0`, CompletionItemKind.Property, {
      detail: paramDetail(p),
      documentation: p.doc ? md(p.doc) : undefined,
      sortText: "0" + p.name,
    }),
  );
}

function paramDetail(p: Param): string {
  const vals = paramEnumValues(p);
  if (vals) return `${p.name}: ${vals.slice(0, 4).join(" | ")}${vals.length > 4 ? " | …" : ""}`;
  return `${p.name}: ${p.valueKind}`;
}

function enumValueCompletions(ctor: Construct, paramName: string): CompletionItem[] | null {
  const param = ctor.params.find((p) => p.name === paramName);
  const vals = param && paramEnumValues(param);
  if (!param || !vals) return null;
  return vals.map((v) =>
    plain(v, CompletionItemKind.EnumMember, {
      detail: `${ctor.name} ${param.name}`,
      documentation: param.doc ? md(param.doc) : undefined,
    }),
  );
}

function typeCompletions(): CompletionItem[] {
  return catalog.types.map((t) =>
    plain(t, CompletionItemKind.TypeParameter, {
      detail: "wire type",
      documentation: md(catalog.typeDocs[t] ?? ""),
    }),
  );
}

const SYM_KIND: Record<Sym["kind"], CompletionItemKind> = {
  input: CompletionItemKind.Variable,
  output: CompletionItemKind.Variable,
  let: CompletionItemKind.Variable,
  param: CompletionItemKind.Variable,
  device: CompletionItemKind.Variable,
  func: CompletionItemKind.Function,
  section: CompletionItemKind.Module,
};

function generalCompletions(model: DocModel, line: number): CompletionItem[] {
  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  const push = (it: CompletionItem) => {
    if (seen.has(it.label + (it.kind ?? ""))) return;
    seen.add(it.label + (it.kind ?? ""));
    items.push(it);
  };

  // In-scope user symbols first.
  for (const s of model.symbols) {
    if (s.kind === "func") {
      push(snippet(s.name, `${s.name}($0)`, CompletionItemKind.Function, { detail: s.detail, sortText: "1" + s.name }));
    } else {
      push(plain(s.name, SYM_KIND[s.kind], { detail: s.detail, sortText: "1" + s.name }));
    }
  }

  // Test DSL builtins + assertion macros when inside a @Test body.
  if (model.testBodyLines.has(line)) {
    for (const b of catalog.dslBuiltins) {
      push(snippet(b.name, `${b.name}($0)`, CompletionItemKind.Function, {
        detail: b.signature,
        documentation: md(b.doc),
        sortText: "2" + b.name,
      }));
    }
    push(snippet("expect", "#expect($1)$0", CompletionItemKind.Function, { detail: "#expect(cond)", sortText: "2expect" }));
    push(snippet("require", "try #require($1)$0", CompletionItemKind.Function, { detail: "try #require(cond)", sortText: "2require" }));
  }

  // Keywords.
  for (const k of catalog.keywords) {
    push(plain(k, CompletionItemKind.Keyword, { detail: "keyword", documentation: md(catalog.keywordDocs[k] ?? ""), sortText: "3" + k }));
  }
  // World declarations.
  for (const w of catalog.worldDecls) {
    push(plain(w.name, CompletionItemKind.Keyword, { detail: w.signature, documentation: md(w.doc), sortText: "3" + w.name }));
  }
  // Types.
  for (const t of catalog.types) {
    push(plain(t, CompletionItemKind.TypeParameter, { detail: "wire type", documentation: md(catalog.typeDocs[t] ?? ""), sortText: "4" + t }));
  }
  // Construct constructors.
  for (const c of catalog.constructs) {
    push(snippet(c.name, `${c.name}($0)`, CompletionItemKind.Class, {
      detail: `${c.name}(…) construct`,
      documentation: md(c.doc),
      sortText: "5" + c.name,
    }));
  }
  return items;
}

// ---- entry point ------------------------------------------------------------

export function provideCompletions(model: DocModel, line: string, pos: Position): CompletionItem[] {
  const p = getPrefix(line, pos.character);
  if (p.inComment || p.inString) return [];
  const before = p.before;

  // 1. member access: base.<word>
  if (/([A-Za-z_]\w*)\s*\.\s*\w*$/.test(before)) {
    const base = /([A-Za-z_]\w*)\s*\.\s*\w*$/.exec(before)![1];
    const ctorName = model.devices.get(base);
    return ctorName ? memberCompletions(getConstruct(ctorName)!, before) : [];
  }

  // 2. attribute: @<word>
  if (/@\w*$/.test(before)) return attrCompletions(line);

  // 3. test macro: #<word>
  if (/#\w*$/.test(before)) return macroCompletions(before);

  // 4. inside a construct call
  const call = constructCallContext(before);
  if (call) {
    if (call.enumParam) {
      const vals = enumValueCompletions(call.construct, call.enumParam);
      if (vals) return vals;
      return generalCompletions(model, pos.line); // value of a non-enum param
    }
    return paramCompletions(call.construct);
  }

  // 5. type annotation position
  const typeCtx =
    /\b(?:input|output|let|var)\s+[A-Za-z_]\w*\s*:\s*\[?\s*\w*$/.test(before) ||
    /->\s*\[?\s*\w*$/.test(before) ||
    /[(,]\s*[A-Za-z_]\w*\s*:\s*\[?\s*\w*$/.test(before);
  if (typeCtx) return typeCompletions();

  // 6. general
  return generalCompletions(model, pos.line);
}
