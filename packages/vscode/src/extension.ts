// VS Code client: launches the shared .wcode language server and registers a
// few convenience commands that drive the wiremod-scheme CLI.

import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("out", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "wcode" },
      { scheme: "untitled", language: "wcode" },
    ],
    initializationOptions: { wcode: vscode.workspace.getConfiguration("wcode") },
    synchronize: {
      configurationSection: "wcode",
    },
  };

  client = new LanguageClient("wcode", "Wirescript Language Server", serverOptions, clientOptions);
  client.start();

  context.subscriptions.push(
    vscode.commands.registerCommand("wcode.validate", () => runCli("validate")),
    vscode.commands.registerCommand("wcode.test", () => runCli("test")),
    vscode.commands.registerCommand("wcode.graph", () => runCli("graph")),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

async function runCli(sub: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "wcode") {
    void vscode.window.showWarningMessage("Open a .wcode file to run this command.");
    return;
  }
  await editor.document.save();
  const file = editor.document.uri.fsPath;
  const compiler = vscode.workspace.getConfiguration("wcode").get<string>("compilerPath", "wiremod-scheme");
  const terminal = vscode.window.createTerminal("wirescript");
  terminal.show();
  terminal.sendText(`${quote(compiler)} ${sub} ${quote(file)}`);
}

function quote(s: string): string {
  return /\s/.test(s) ? `"${s}"` : s;
}
