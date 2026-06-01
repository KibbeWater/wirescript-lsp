// End-to-end smoke test for the language server: drive it over stdio like an
// editor would and print completion labels for several cursor contexts.
//
//   node scripts/smoke-lsp.mjs
//
// Exits non-zero if the server doesn't answer or an expected completion is
// missing.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, "packages/server/out/server.js");

const child = spawn("node", [server, "--stdio"], { stdio: ["pipe", "pipe", "inherit"] });

let buf = Buffer.alloc(0);
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const header = buf.indexOf("\r\n\r\n");
    if (header < 0) return;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, header).toString());
    if (!m) return;
    const len = parseInt(m[1], 10);
    const start = header + 4;
    if (buf.length < start + len) return;
    const msg = JSON.parse(buf.slice(start, start + len).toString());
    buf = buf.slice(start + len);
    if (process.env.DEBUG_LSP) console.error("<<", JSON.stringify(msg).slice(0, 200));
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(method, params, isNotification = false) {
  const msg = { jsonrpc: "2.0", method, params };
  let p = Promise.resolve();
  if (!isNotification) {
    const id = nextId++;
    msg.id = id;
    p = new Promise((res) => pending.set(id, res));
  }
  const json = JSON.stringify(msg);
  child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  return p;
}

const SAMPLE = `module showcase
let mem = Memory()
let g = Gate(type: )
input x: Number @scanner
[Name="r"] {
  output y: Number @screen = mem.
}
@Test("t", arguments: [(1,1)])
func t(d: Number, m: Number) {
  beam(x, 5, d)

}
`;
const uri = "file:///virtual/smoke.wcode";

function labelsAt(line, character) {
  return send("textDocument/completion", {
    textDocument: { uri },
    position: { line, character },
  }).then((r) => {
    const items = Array.isArray(r.result) ? r.result : (r.result?.items ?? []);
    return items.map((i) => i.label);
  });
}

let failures = 0;
function expect(name, labels, wanted) {
  const ok = wanted.every((w) => labels.includes(w));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: [${labels.slice(0, 10).join(", ")}${labels.length > 10 ? ", …" : ""}]`);
  if (!ok) {
    failures++;
    console.log(`        expected to include: ${wanted.join(", ")}`);
  }
}

(async () => {
  await send("initialize", { processId: process.pid, rootUri: null, capabilities: {} });
  await send("initialized", {}, true);
  await send(
    "textDocument/didOpen",
    { textDocument: { uri, languageId: "wcode", version: 1, text: SAMPLE } },
    true,
  );

  // line 2: `let g = Gate(type: )` — cursor after `type: ` -> gate ops
  expect("gate enum values", await labelsAt(2, 19), ["GreaterEqual", "And", "Random"]);

  // line 5: `  output y: Number @screen = mem.` -> Memory ports
  const memLine = SAMPLE.split("\n")[5];
  expect("member ports (mem.)", await labelsAt(5, memLine.length), ["output", "has_value", "input", "store", "clear"]);

  // line 3: `input x: Number @scanner` — after `@` -> input attrs.
  expect("input attributes", await labelsAt(3, "input x: Number @".length), ["scanner", "money", "button", "keypad"]);

  // line 10: empty line inside the @Test body -> DSL builtins available
  expect("test DSL builtins", await labelsAt(10, 2), ["beam", "tick", "deposit"]);

  // hover on `Memory`
  const hov = await send("textDocument/hover", { textDocument: { uri }, position: { line: 1, character: 10 } });
  const hovText = hov.result?.contents?.value ?? "";
  console.log(`${hovText.includes("Memory") ? "PASS" : "FAIL"}  hover(Memory): ${hovText.split("\n")[0]}`);
  if (!hovText.includes("Memory")) failures++;

  // document symbols
  const syms = await send("textDocument/documentSymbol", { textDocument: { uri } });
  const names = (syms.result ?? []).map((s) => s.name);
  expect("document symbols", names, ["mem", "x", "y", "r"]);

  child.kill();
  console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
