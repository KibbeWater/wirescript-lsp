" Vim regex syntax for .wcode — a zero-build fallback for when the tree-sitter
" grammar isn't installed. Tree-sitter (see ../queries) supersedes this when
" active.

if exists("b:current_syntax")
  finish
endif

syntax keyword wcodeKeyword module import input output let var func return if else try
syntax keyword wcodeBoolean true false
syntax keyword wcodeType Number Bool String Any
syntax keyword wcodeConstruct Gate Constant Button Keypad Screen Speaker User Trigger MoneyPot Forcer Led Notifier Interval Delay Memory Camera Target Synthesizer
syntax keyword wcodeWorld owner player dispenser

syntax match wcodeComment "//.*$" contains=@Spell
syntax region wcodeString start=+"+ skip=+\\"+ end=+"+ contains=wcodeStringEscape
syntax match wcodeStringEscape "\\." contained
syntax match wcodeNumber "\<\d\+\%(\.\d\+\)\?\>"

syntax match wcodeAttribute "@\h\w*"
syntax match wcodeMacro "#\%(expect\|require\)\>"
syntax match wcodeBuiltin "\<\%(beamClear\|beam\|press\|deposit\|submit\|reset\|force\|damage\|select\|tick\|wait\)\>\ze\s*("
syntax match wcodeFunction "\<func\s\+\zs\h\w*"
syntax match wcodeOperator "->\|==\|!=\|<=\|>=\|&&\|||\|[-+*/%<>!?=]"

highlight default link wcodeKeyword Keyword
highlight default link wcodeBoolean Boolean
highlight default link wcodeType Type
highlight default link wcodeConstruct Structure
highlight default link wcodeWorld Keyword
highlight default link wcodeComment Comment
highlight default link wcodeString String
highlight default link wcodeStringEscape SpecialChar
highlight default link wcodeNumber Number
highlight default link wcodeAttribute PreProc
highlight default link wcodeMacro Macro
highlight default link wcodeBuiltin Function
highlight default link wcodeFunction Function
highlight default link wcodeOperator Operator

let b:current_syntax = "wcode"
