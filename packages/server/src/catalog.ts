// Typed accessors over the canonical language description in
// data/wcode-language.json. esbuild inlines the JSON into the bundle, so the
// server is self-contained.

import catalogJson from "../../../data/wcode-language.json";

export interface Port {
  name: string;
  type: string;
  doc?: string;
}

export interface Param {
  name: string;
  valueKind: "number" | "string" | "bool" | "enum" | "color" | "any";
  enumValues?: string[];
  enumRef?: string;
  doc?: string;
}

export interface Construct {
  name: string;
  wsch: string;
  doc: string;
  params: Param[];
  inputs: Port[];
  outputs: Port[];
}

export interface AttrDef {
  name: string;
  construct: string;
  doc: string;
}

export interface DslBuiltin {
  name: string;
  signature: string;
  minArgs: number;
  maxArgs: number;
  doc: string;
}

export interface MacroDef {
  name: string;
  sigil: string;
  prefix?: string;
  signature: string;
  doc: string;
}

export interface WorldDecl {
  name: string;
  signature: string;
  doc: string;
}

export interface Catalog {
  name: string;
  displayName: string;
  fileExtensions: string[];
  lineComment: string;
  keywords: string[];
  keywordDocs: Record<string, string>;
  types: string[];
  typeDocs: Record<string, string>;
  booleans: string[];
  inputAttrs: AttrDef[];
  outputAttrs: AttrDef[];
  testAttribute: { name: string; signature: string; doc: string };
  testMacros: MacroDef[];
  dslBuiltins: DslBuiltin[];
  worldDecls: WorldDecl[];
  gateOps: string[];
  constructs: Construct[];
}

export const catalog = catalogJson as unknown as Catalog;

const constructIndex = new Map<string, Construct>(catalog.constructs.map((c) => [c.name, c]));
const dslIndex = new Map<string, DslBuiltin>(catalog.dslBuiltins.map((b) => [b.name, b]));
const keywordSet = new Set(catalog.keywords);
const typeSet = new Set(catalog.types);
const gateOpSet = new Set(catalog.gateOps);

export function getConstruct(name: string): Construct | undefined {
  return constructIndex.get(name);
}

export function isConstructName(name: string): boolean {
  return constructIndex.has(name);
}

export function getDsl(name: string): DslBuiltin | undefined {
  return dslIndex.get(name);
}

export function isKeyword(word: string): boolean {
  return keywordSet.has(word);
}

export function isType(word: string): boolean {
  return typeSet.has(word);
}

export function isGateOp(word: string): boolean {
  return gateOpSet.has(word);
}

/** The allowed identifier values of an enum-like construct parameter, if any. */
export function paramEnumValues(p: Param): string[] | undefined {
  if (p.enumValues) return p.enumValues;
  if (p.enumRef === "gateOps") return catalog.gateOps;
  return undefined;
}

export function findInputAttr(name: string): AttrDef | undefined {
  return catalog.inputAttrs.find((a) => a.name === name);
}

export function findOutputAttr(name: string): AttrDef | undefined {
  return catalog.outputAttrs.find((a) => a.name === name);
}

export function findMacro(name: string): MacroDef | undefined {
  return catalog.testMacros.find((m) => m.name === name);
}
