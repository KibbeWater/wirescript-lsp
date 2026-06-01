; Highlight queries for .wcode. Capture names follow the Neovim standard groups.
; The construct / wire-type / gate-op name lists mirror data/wcode-language.json.

; --- comments & literals ----------------------------------------------------
(comment) @comment

(number) @number
(string) @string
(boolean) @boolean

; --- keywords ---------------------------------------------------------------
[
  "let"
  "var"
  "func"
  "if"
  "else"
  "try"
  "input"
  "output"
] @keyword

[ "module" "import" ] @keyword.import
"return" @keyword.return

(module_decl name: (identifier) @module)
(world_decl kind: (identifier) @keyword)
(section_header) @keyword

; --- functions --------------------------------------------------------------
(func_decl name: (identifier) @function)
(call_expr function: (identifier) @function.call)

; test DSL builtins (override the generic call colour)
((call_expr function: (identifier) @function.builtin)
  (#any-of? @function.builtin
    "beam" "beamClear" "press" "deposit" "submit" "reset"
    "force" "damage" "select" "tick" "wait"))

; assertion macros: #expect / try #require
(expect_stmt name: (identifier) @function.macro)
(require_stmt name: (identifier) @function.macro)
"#" @punctuation.special

; --- attributes -------------------------------------------------------------
(attribute "@" @attribute (identifier) @attribute)
(test_decl "@" @attribute attr: (identifier) @attribute)

; --- parameters, labels, properties ----------------------------------------
(param name: (identifier) @variable.parameter)
(argument label: (identifier) @variable.parameter)
(world_attr name: (identifier) @property)
(member_expr member: (identifier) @property)
(wire_stmt port: (identifier) @property)

; --- types ------------------------------------------------------------------
(named_type name: (identifier) @type)
((named_type name: (identifier) @type.builtin)
  (#any-of? @type.builtin "Number" "Bool" "String" "Any"))

; --- constructs (the 18 wire constructs) ------------------------------------
((identifier) @type
  (#any-of? @type
    "Gate" "Constant" "Button" "Keypad" "Screen" "Speaker" "User" "Trigger"
    "MoneyPot" "Forcer" "Led" "Notifier" "Interval" "Delay" "Memory" "Camera"
    "Target" "Synthesizer"))

; --- gate operations / enum identifiers (as construct param values) ---------
((argument value: (identifier) @constant)
  (#any-of? @constant
    "And" "Or" "Not" "Xor" "Nand" "Nor" "If"
    "Add" "Subtract" "Multiply" "Divide" "Modulo" "Power" "Min" "Max"
    "Equal" "NotEqual" "GreaterThan" "LessThan" "GreaterEqual" "LessEqual"
    "Random" "Abs" "Floor" "Ceiling" "Round" "Sin" "Cos" "Tan" "Sqrt" "Log"
    "Clamp" "Lerp" "Select" "Latch" "Threshold" "Invert"
    "Concat" "Length" "Substring" "ToUpper" "ToLower"
    "Time" "DeltaTime" "Vector2" "Vector3" "VectorGet"
    "Everything" "PlayerOnly" "EntityOnly" "ConstructOnly"
    "Default" "PlayerJob" "PlayerWallet" "Health" "PlayerPocket" "PlayerEquipment"))

; --- operators & punctuation ------------------------------------------------
[
  "+" "-" "*" "/" "%"
  "==" "!=" "<" ">" "<=" ">="
  "&&" "||" "!"
  "?" "->" "="
] @operator

[ "(" ")" "[" "]" "{" "}" ] @punctuation.bracket
[ "," ";" "." ":" ] @punctuation.delimiter
