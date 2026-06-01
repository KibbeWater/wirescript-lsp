#!/usr/bin/env node
// The .wcode language server. Speaks LSP over stdio (default) so VS Code,
// Neovim and JetBrains (via LSP4IJ) can all share one implementation.

import {
  createConnection,
  DidChangeConfigurationNotification,
  DocumentSymbol,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  Range,
  SymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { provideCompletions } from "./completion";
import { provideHover } from "./hover";
import { buildModel, DocModel, Sym } from "./symbols";
import { catalog } from "./catalog";
import { DiagnosticsRunner, DiagSettings, defaultDiagSettings } from "./diagnostics";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigCapability = false;

// ---- settings ---------------------------------------------------------------

let settings: DiagSettings = { ...defaultDiagSettings };

function applySettings(raw: unknown): void {
  const w = (raw as { wcode?: Record<string, unknown> })?.wcode ?? (raw as Record<string, unknown>);
  if (!w || typeof w !== "object") return;
  const o = w as Record<string, unknown>;
  if (typeof o.compilerPath === "string" && o.compilerPath) settings.compilerPath = o.compilerPath;
  // VS Code nests these under `diagnostics`; accept both flat and nested.
  const diag = (o.diagnostics as Record<string, unknown>) ?? o;
  if (typeof diag.enable === "boolean") settings.enable = diag.enable;
  if (diag.run === "onSave" || diag.run === "onType") settings.run = diag.run;
}

// ---- document model cache ---------------------------------------------------

const models = new Map<string, { version: number; model: DocModel }>();

function modelFor(doc: TextDocument): DocModel {
  const cached = models.get(doc.uri);
  if (cached && cached.version === doc.version) return cached.model;
  const model = buildModel(doc.getText());
  models.set(doc.uri, { version: doc.version, model });
  return model;
}

function lineAt(doc: TextDocument, line: number): string {
  const lines = doc.getText().split(/\r?\n/);
  return lines[line] ?? "";
}

// ---- diagnostics ------------------------------------------------------------

const diagnostics = new DiagnosticsRunner(
  (uri, diags) => connection.sendDiagnostics({ uri, diagnostics: diags }),
  (message) => connection.window.showInformationMessage(message),
);

// ---- lifecycle --------------------------------------------------------------

connection.onInitialize((params: InitializeParams): InitializeResult => {
  hasConfigCapability = !!params.capabilities.workspace?.configuration;
  applySettings(params.initializationOptions);

  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
        save: { includeText: false },
      },
      completionProvider: {
        triggerCharacters: [".", "@", "#", ":", "(", " "],
        resolveProvider: false,
      },
      hoverProvider: true,
      documentSymbolProvider: true,
    },
    serverInfo: { name: "wcode-language-server", version: "0.1.0" },
  };
});

connection.onInitialized(() => {
  if (hasConfigCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
    void refreshConfig();
  }
});

async function refreshConfig(): Promise<void> {
  if (!hasConfigCapability) return;
  try {
    const cfg = await connection.workspace.getConfiguration("wcode");
    applySettings({ wcode: cfg });
    revalidateAll(true);
  } catch {
    /* configuration not available */
  }
}

connection.onDidChangeConfiguration((params) => {
  if (hasConfigCapability) void refreshConfig();
  else {
    applySettings(params.settings);
    revalidateAll(true);
  }
});

function revalidateAll(immediate: boolean): void {
  for (const doc of documents.all()) diagnostics.schedule(doc, settings, immediate);
}

// ---- documents --------------------------------------------------------------

documents.onDidOpen((e) => diagnostics.schedule(e.document, settings, true));
documents.onDidSave((e) => diagnostics.schedule(e.document, settings, true));
documents.onDidClose((e) => {
  models.delete(e.document.uri);
  diagnostics.close(e.document.uri);
});
documents.onDidChangeContent((e) => {
  models.delete(e.document.uri);
  if (settings.run === "onType") diagnostics.schedule(e.document, settings, false);
});

// ---- providers --------------------------------------------------------------

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return provideCompletions(modelFor(doc), lineAt(doc, params.position.line), params.position);
});

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  return provideHover(modelFor(doc), lineAt(doc, params.position.line), params.position);
});

const SYMBOL_KIND: Record<Sym["kind"], SymbolKind> = {
  input: SymbolKind.Field,
  output: SymbolKind.Field,
  let: SymbolKind.Variable,
  param: SymbolKind.Variable,
  device: SymbolKind.Object,
  func: SymbolKind.Function,
  section: SymbolKind.Namespace,
};

connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const model = modelFor(doc);
  const out: DocumentSymbol[] = [];
  const emit = (s: Sym) => {
    if (s.kind === "param") return; // params are noise in the outline
    const range = Range.create(s.line, 0, s.line, lineAt(doc, s.line).length);
    out.push({
      name: s.name,
      detail: s.detail,
      kind: SYMBOL_KIND[s.kind],
      range,
      selectionRange: range,
    });
  };
  model.sections.forEach(emit);
  model.symbols.forEach(emit);
  out.sort((a, b) => a.range.start.line - b.range.start.line);
  return out;
});

// ---- go --------------------------------------------------------------------

documents.listen(connection);
connection.listen();
connection.console.info(`wcode language server ready (${catalog.constructs.length} constructs)`);
