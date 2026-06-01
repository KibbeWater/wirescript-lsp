; AUTO-SYNCED from tree-sitter-wcode/queries/locals.scm by scripts/gen-grammars.mjs — do not edit here.
; Local scopes / definitions / references for .wcode — lets Neovim resolve
; identifier references to their declarations for steadier highlighting.

(source_file) @local.scope
(func_decl body: (block) @local.scope)
(section) @local.scope

(binding name: (identifier) @local.definition.var)
(port_decl name: (identifier) @local.definition.var)
(param name: (identifier) @local.definition.parameter)
(func_decl name: (identifier) @local.definition.function)

(identifier) @local.reference
