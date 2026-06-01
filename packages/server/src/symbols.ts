// Build a lightweight per-document symbol model used by completion, hover and
// the document-symbol outline. This is a tolerant, line-based scan — not the
// real compiler — so it never throws on incomplete/invalid source.

import { getConstruct } from "./catalog";
import { splitLines } from "./scanner";

export type SymKind = "input" | "output" | "let" | "func" | "device" | "param" | "section";

export interface Sym {
  name: string;
  kind: SymKind;
  /** Wire type for ports/lets, or a signature for funcs. */
  type?: string;
  /** Construct name for device bindings. */
  construct?: string;
  /** Short label shown in completion `detail`. */
  detail: string;
  doc?: string;
  /** 0-based declaration line. */
  line: number;
}

export interface DocModel {
  symbols: Sym[];
  /** binding name -> construct name (`let d = Memory()`). */
  devices: Map<string, string>;
  sections: Sym[];
  /** Lines that sit inside a `@Test` function body. */
  testBodyLines: Set<number>;
}

/** Replace string contents and trailing comments with spaces (length-preserving
 *  enough for our line-anchored regexes). */
function strip(line: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") {
        out += "  ";
        i++;
        continue;
      }
      if (c === '"') {
        inStr = false;
        out += " ";
        continue;
      }
      out += " ";
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += " ";
      continue;
    }
    if (c === "/" && line[i + 1] === "/") break;
    out += c;
  }
  return out;
}

const RE_PORT = /^\s*(input|output)\s+([A-Za-z_]\w*)\s*:\s*(\[?\s*[A-Za-z_]\w*\s*\]?)/;
const RE_DEVICE = /^\s*let\s+([A-Za-z_]\w*)\s*(?::\s*[^=]+?)?=\s*([A-Z][A-Za-z0-9_]*)\s*\(/;
const RE_LET = /^\s*let\s+([A-Za-z_]\w*)\b/;
const RE_FUNC = /^\s*func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*(\[?\s*[A-Za-z_]\w*\s*\]?))?/;
const RE_SECTION = /^\s*\[\s*Name\s*=\s*"([^"]*)"/;
const RE_PARAM = /^\s*([A-Za-z_]\w*)\s*:\s*(\[?\s*[A-Za-z_]\w*\s*\]?)/;

export function buildModel(text: string): DocModel {
  const lines = splitLines(text);
  const symbols: Sym[] = [];
  const devices = new Map<string, string>();
  const sections: Sym[] = [];
  const testBodyLines = new Set<number>();

  let depth = 0;
  let testDepth = -1; // brace depth of the active @Test body, or -1
  let pendingTest = false;

  const norm = (t: string) => t.replace(/\s+/g, "");

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const s = strip(raw);

    if (testDepth !== -1) testBodyLines.add(li);
    if (/@\s*Test\b/.test(s)) pendingTest = true;

    // A `@export(...)` decorator may sit on the same line as its `let` binding;
    // strip it so the binding is still picked up.
    const decl = s.replace(/^(\s*)@\s*export\b\s*(\([^)]*\))?\s*/, "$1");

    let m: RegExpExecArray | null;

    if ((m = RE_PORT.exec(decl))) {
      const kind = m[1] as "input" | "output";
      const type = norm(m[3]);
      symbols.push({ name: m[2], kind, type, detail: `${kind} ${m[2]}: ${type}`, line: li });
    } else if ((m = RE_DEVICE.exec(decl)) && getConstruct(m[2])) {
      devices.set(m[1], m[2]);
      symbols.push({
        name: m[1],
        kind: "device",
        construct: m[2],
        type: m[2],
        detail: `let ${m[1]} = ${m[2]}(…)`,
        line: li,
      });
    } else if ((m = RE_LET.exec(decl))) {
      symbols.push({ name: m[1], kind: "let", detail: `let ${m[1]}`, line: li });
    }

    if ((m = RE_FUNC.exec(decl))) {
      const isTestFunc = pendingTest;
      const params = m[2].trim();
      const ret = m[3] ? norm(m[3]) : undefined;
      const sig = `func ${m[1]}(${params})${ret ? ` -> ${ret}` : ""}`;
      if (!isTestFunc) {
        symbols.push({ name: m[1], kind: "func", type: sig, detail: sig, line: li });
      }
      for (const part of params.split(",")) {
        const pm = RE_PARAM.exec(part);
        if (pm) {
          const ptype = norm(pm[2]);
          symbols.push({
            name: pm[1],
            kind: "param",
            type: ptype,
            detail: `${pm[1]}: ${ptype}`,
            line: li,
          });
        }
      }
    }

    if ((m = RE_SECTION.exec(raw))) {
      sections.push({ name: m[1], kind: "section", detail: `[Name="${m[1]}"]`, line: li });
    }

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "{") {
        depth++;
        if (pendingTest && testDepth === -1) {
          testDepth = depth;
          pendingTest = false;
        }
      } else if (c === "}") {
        if (testDepth !== -1 && depth === testDepth) testDepth = -1;
        depth--;
      }
    }
  }

  return { symbols, devices, sections, testBodyLines };
}

/** Look up a declared symbol by name (first declaration wins). */
export function findSym(model: DocModel, name: string): Sym | undefined {
  return model.symbols.find((s) => s.name === name);
}
