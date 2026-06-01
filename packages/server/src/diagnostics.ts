// Live diagnostics by running `wiremod-scheme validate <file>` and parsing its
// `path:line:col: severity[CODE]: message` output. Debounced; auto-disables if
// the compiler binary cannot be found.

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";

export interface DiagSettings {
  enable: boolean;
  compilerPath: string;
  run: "onSave" | "onType";
}

export const defaultDiagSettings: DiagSettings = {
  enable: true,
  compilerPath: "wiremod-scheme",
  run: "onSave",
};

// Tolerates an optional leading `error: ` prefix and Windows drive paths; the
// `:N:N: severity[CODE]:` core is what anchors the match.
const LINE_RE = /(.+?):(\d+):(\d+):\s+(error|warning)\[([^\]]+)\]:\s+(.*)$/;

export class DiagnosticsRunner {
  private timers = new Map<string, NodeJS.Timeout>();
  private disabled = false;

  constructor(
    private readonly publish: (uri: string, diags: Diagnostic[]) => void,
    private readonly notify: (message: string) => void,
  ) {}

  /** Clear any pending run and published diagnostics for a closed document. */
  close(uri: string): void {
    const t = this.timers.get(uri);
    if (t) clearTimeout(t);
    this.timers.delete(uri);
    this.publish(uri, []);
  }

  /** Schedule validation. `immediate` runs without the debounce (open/save). */
  schedule(doc: TextDocument, settings: DiagSettings, immediate: boolean): void {
    if (!settings.enable || this.disabled) {
      this.publish(doc.uri, []);
      return;
    }
    const prev = this.timers.get(doc.uri);
    if (prev) clearTimeout(prev);
    this.timers.set(
      doc.uri,
      setTimeout(() => this.run(doc, settings), immediate ? 0 : 400),
    );
  }

  private run(doc: TextDocument, settings: DiagSettings): void {
    const { path, cleanup } = this.materialize(doc, settings);
    let output = "";
    let child;
    try {
      child = spawn(settings.compilerPath, ["validate", path], { windowsHide: true });
    } catch (e) {
      this.onSpawnError(e, settings);
      cleanup();
      return;
    }
    child.on("error", (e) => {
      this.onSpawnError(e, settings);
      cleanup();
    });
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", () => {
      cleanup();
      if (!this.disabled) this.publish(doc.uri, this.parse(output, doc));
    });
  }

  /** Produce a `.wcode` file on disk that holds the buffer's current text. */
  private materialize(doc: TextDocument, settings: DiagSettings): { path: string; cleanup: () => void } {
    const uri = URI.parse(doc.uri);
    if (uri.scheme === "file") {
      const real = uri.fsPath;
      // On save the buffer matches disk — validate it in place so relative
      // `import` paths resolve.
      if (settings.run === "onSave") return { path: real, cleanup: () => {} };
      // On type, write a sibling temp reflecting unsaved edits (still resolves
      // sibling imports). Keep the `.wcode` extension — the CLI dispatches on it.
      const tmp = join(dirname(real), `${basename(real, ".wcode")}.__wcodecheck__.wcode`);
      writeFileSync(tmp, doc.getText());
      return { path: tmp, cleanup: () => safeUnlink(tmp) };
    }
    // Untitled or other schemes: fall back to the OS temp dir.
    const tmp = join(tmpdir(), `wcode-lsp-${hash(doc.uri)}.wcode`);
    writeFileSync(tmp, doc.getText());
    return { path: tmp, cleanup: () => safeUnlink(tmp) };
  }

  private parse(output: string, doc: TextDocument): Diagnostic[] {
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    const seen = new Set<string>();
    const diags: Diagnostic[] = [];
    for (const raw of output.split(/\r?\n/)) {
      const m = LINE_RE.exec(raw.trimEnd());
      if (!m) continue;
      const line = Math.max(0, parseInt(m[2], 10) - 1);
      const col = Math.max(0, parseInt(m[3], 10) - 1);
      const severity = m[4] === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;
      const code = m[5];
      const message = m[6];
      const key = `${line}:${col}:${code}:${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      diags.push({
        range: rangeFor(lines[line] ?? "", line, col),
        severity,
        code,
        source: "wcode",
        message,
      });
    }
    return diags;
  }

  private onSpawnError(e: unknown, settings: DiagSettings): void {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" && !this.disabled) {
      this.disabled = true;
      this.notify(
        `wcode: compiler '${settings.compilerPath}' was not found — live diagnostics are disabled. ` +
          `Build it (cargo build --release in wiremod-scheme) and set "wcode.compilerPath" to the binary, ` +
          `then reload to re-enable.`,
      );
    }
  }
}

function rangeFor(lineText: string, line: number, col: number): Range {
  const m = /^[A-Za-z0-9_]+/.exec(lineText.slice(col));
  const len = m ? m[0].length : 1;
  return Range.create(line, col, line, col + len);
}

function safeUnlink(p: string): void {
  try {
    unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
