// Verify the live-diagnostics path end-to-end: point the server at a real
// wiremod-scheme binary, open a file with a type error, and confirm a
// publishDiagnostics arrives at the right location.
//
//   WCODE_COMPILER=/path/to/wiremod-scheme node scripts/smoke-diag.mjs

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const compiler = process.env.WCODE_COMPILER;
if (!compiler) {
  console.error("set WCODE_COMPILER to the wiremod-scheme binary to run this check");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, "packages/server/out/server.js");

const badPath = join(tmpdir(), "wcode-diag-check.wcode");
writeFileSync(badPath, "input x: String @scanner\noutput y: Number @screen = x\n");
const uri = "file:///" + badPath.replace(/\\/g, "/");

const child = spawn("node", [server, "--stdio"], { stdio: ["pipe", "pipe", "inherit"] });
let buf = Buffer.alloc(0);
const pending = new Map();
let nextId = 1;
let diagnostics = null;

child.stdout.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const h = buf.indexOf("\r\n\r\n");
    if (h < 0) return;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, h).toString());
    if (!m) return;
    const len = +m[1];
    const start = h + 4;
    if (buf.length < start + len) return;
    const msg = JSON.parse(buf.slice(start, start + len).toString());
    buf = buf.slice(start + len);
    if (msg.method === "textDocument/publishDiagnostics" && msg.params.uri === uri) {
      diagnostics = msg.params.diagnostics;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(method, params, notification = false) {
  const msg = { jsonrpc: "2.0", method, params };
  let p = Promise.resolve();
  if (!notification) {
    msg.id = nextId++;
    p = new Promise((res) => pending.set(msg.id, res));
  }
  const json = JSON.stringify(msg);
  child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  return p;
}

const wait = (ms) =>
  new Promise((res) => {
    const t = setTimeout(res, ms);
    if (t.unref) t.unref();
  });

(async () => {
  await send("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
      wcode: { compilerPath: compiler, diagnostics: { enable: true, run: "onSave" } },
    },
  });
  await send("initialized", {}, true);
  await send(
    "textDocument/didOpen",
    { textDocument: { uri, languageId: "wcode", version: 1, text: "input x: String @scanner\noutput y: Number @screen = x\n" } },
    true,
  );

  // Wait for the compiler to run and diagnostics to publish.
  for (let i = 0; i < 30 && (diagnostics === null || diagnostics.length === 0); i++) await wait(150);

  child.kill();
  if (!diagnostics || diagnostics.length === 0) {
    console.log("FAIL  no diagnostics received");
    process.exit(1);
  }
  const d = diagnostics[0];
  const ok = d.code === "E_TYPE_MISMATCH" && d.range.start.line === 1 && d.source === "wcode";
  console.log(`${ok ? "PASS" : "FAIL"}  diagnostic: [${d.code}] @ ${d.range.start.line}:${d.range.start.character} — ${d.message}`);
  process.exit(ok ? 0 : 1);
})();
