/**
 * tree-sitter grammar for the .wcode wirescript language.
 *
 * Mirrors the lexer/parser in wiremod-scheme/src/wcode. The reserved keyword
 * set matches token.rs. Construct names, wire types, gate operations and test
 * DSL builtins are ordinary identifiers in the real lexer (not keywords), so
 * they are NOT reserved here — they are highlighted by queries/highlights.scm
 * (whose name lists mirror ../data/wcode-language.json).
 */

const PREC = {
  ternary: 1,
  or: 2,
  and: 3,
  equality: 4,
  compare: 5,
  add: 6,
  mul: 7,
  unary: 8,
  postfix: 9,
};

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)), optional(","));
}
function commaSep(rule) {
  return optional(commaSep1(rule));
}

module.exports = grammar({
  name: "wcode",

  word: ($) => $.identifier,
  extras: ($) => [/\s+/, $.comment],

  // A world declaration's trailing `name: value` attributes look like the start
  // of the next world declaration (`kind value`); only the token after the
  // identifier (`:` vs a value) tells them apart. Let the GLR parser explore
  // both and keep the one that succeeds.
  conflicts: ($) => [[$.world_decl]],

  rules: {
    source_file: ($) => seq(optional($.module_decl), repeat($._item)),

    comment: ($) => token(seq("//", /[^\n]*/)),

    module_decl: ($) => seq("module", field("name", $.identifier)),

    _item: ($) =>
      choice(
        $.import_decl,
        $.port_decl,
        $.binding,
        $.export_binding,
        $.func_decl,
        $.section,
        $.test_decl,
        $.world_decl,
        $.wire_stmt,
      ),

    import_decl: ($) => seq("import", field("path", $.string)),

    // prec.right makes the optional `@attr` / `= value` suffixes attach to this
    // port rather than ending it early (the next item could also begin with `@`).
    port_decl: ($) =>
      prec.right(
        seq(
          field("dir", choice("input", "output")),
          field("name", $.identifier),
          ":",
          field("type", $._type),
          optional($.attribute),
          optional(seq("=", field("value", $._expr))),
        ),
      ),

    attribute: ($) => seq("@", field("name", $.identifier)),

    // `@export(name: "…") let x = <const>` — an item-level decorator on a value
    // binding (the parentheses are optional: `@export let x = 5`).
    export_binding: ($) =>
      seq(
        "@",
        field("attr", $.identifier),
        optional(seq("(", repeat($.export_arg), ")")),
        field("binding", $.binding),
      ),
    export_arg: ($) =>
      seq(field("label", $.identifier), ":", field("value", $._expr), optional(",")),

    binding: ($) =>
      seq(
        field("kind", choice("let", "var")),
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expr),
        optional(";"),
      ),

    func_decl: ($) =>
      seq(
        "func",
        field("name", $.identifier),
        field("params", $.param_list),
        optional(seq("->", field("return_type", $._type))),
        field("body", $.block),
      ),

    param_list: ($) => seq("(", commaSep($.param), ")"),
    param: ($) => seq(field("name", $.identifier), ":", field("type", $._type)),

    // The section opener `[Name=` is a single lexer token so an index `[ … ]`
    // is never misread as a section header (and vice-versa) — the lexer-level
    // equivalent of the real parser's "[Ident =" guard in parser.rs.
    section: ($) =>
      seq(
        field("header", alias($._section_open, $.section_header)),
        field("name", $.string),
        "]",
        "{",
        repeat($._item),
        "}",
      ),
    _section_open: ($) => token(seq("[", /\s*/, "Name", /\s*/, "=")),

    test_decl: ($) =>
      seq(
        "@",
        field("attr", $.identifier),
        "(",
        field("name", $.string),
        optional(seq(",", field("label", $.identifier), ":", field("arguments", $._expr))),
        ")",
        field("func", $.func_decl),
      ),

    world_decl: ($) =>
      seq(field("kind", $.identifier), choice($.number, $.string), repeat($.world_attr)),
    world_attr: ($) =>
      seq(field("name", $.identifier), ":", field("value", $._expr), optional(",")),

    wire_stmt: ($) =>
      seq(
        field("device", $.identifier),
        ".",
        field("port", $._member_name),
        "=",
        field("value", $._expr),
      ),

    block: ($) => seq("{", repeat($._stmt), "}"),

    _stmt: ($) => choice($.return_stmt, $.require_stmt, $.expect_stmt, $.binding, $.expr_stmt),
    return_stmt: ($) => prec.right(seq("return", optional($._expr), optional(";"))),
    expect_stmt: ($) => seq("#", field("name", $.identifier), "(", $._expr, ")", optional(";")),
    require_stmt: ($) =>
      seq("try", "#", field("name", $.identifier), "(", $._expr, ")", optional(";")),
    expr_stmt: ($) => prec(-1, seq($._expr, optional(";"))),

    _type: ($) => choice($.array_type, $.named_type),
    named_type: ($) => field("name", $.identifier),
    array_type: ($) => seq("[", $._type, "]"),

    _expr: ($) =>
      choice(
        $.ternary_expr,
        $.if_expr,
        $.binary_expr,
        $.unary_expr,
        $.call_expr,
        $.index_expr,
        $.member_expr,
        $.parenthesized_expr,
        $.array_expr,
        $.number,
        $.string,
        $.boolean,
        $.identifier,
      ),

    ternary_expr: ($) =>
      prec.right(
        PREC.ternary,
        seq(field("condition", $._expr), "?", field("then", $._expr), ":", field("else", $._expr)),
      ),

    if_expr: ($) =>
      prec.right(
        PREC.ternary,
        seq(
          "if",
          field("condition", $._expr),
          field("then", $.block),
          "else",
          field("else", choice($.if_expr, $.block)),
        ),
      ),

    binary_expr: ($) =>
      choice(
        prec.left(PREC.or, seq($._expr, field("operator", "||"), $._expr)),
        prec.left(PREC.and, seq($._expr, field("operator", "&&"), $._expr)),
        prec.left(PREC.equality, seq($._expr, field("operator", choice("==", "!=")), $._expr)),
        prec.left(PREC.compare, seq($._expr, field("operator", choice("<", ">", "<=", ">=")), $._expr)),
        prec.left(PREC.add, seq($._expr, field("operator", choice("+", "-")), $._expr)),
        prec.left(PREC.mul, seq($._expr, field("operator", choice("*", "/", "%")), $._expr)),
      ),

    unary_expr: ($) => prec(PREC.unary, seq(field("operator", choice("-", "!")), $._expr)),

    call_expr: ($) =>
      prec(PREC.postfix, seq(field("function", $._expr), field("arguments", $.arg_list))),
    arg_list: ($) => seq("(", commaSep($.argument), ")"),
    argument: ($) => seq(optional(seq(field("label", $.identifier), ":")), field("value", $._expr)),

    index_expr: ($) =>
      prec(PREC.postfix, seq(field("base", $._expr), "[", field("index", $._expr), "]")),
    member_expr: ($) =>
      prec(PREC.postfix, seq(field("base", $._expr), ".", field("member", $._member_name))),

    parenthesized_expr: ($) => seq("(", commaSep1($._expr), ")"),
    array_expr: ($) => seq("[", commaSep($._expr), "]"),

    // A member/port name may be an identifier or any keyword (ports include
    // `input`/`output`/`return`).
    _member_name: ($) =>
      choice(
        $.identifier,
        "input",
        "output",
        "let",
        "var",
        "func",
        "return",
        "if",
        "else",
        "module",
        "import",
        "true",
        "false",
        "try",
      ),

    boolean: ($) => choice("true", "false"),

    identifier: ($) => /[A-Za-z_][A-Za-z0-9_]*/,
    number: ($) => /[0-9]+(\.[0-9]+)?/,
    string: ($) => seq('"', repeat(choice(/[^"\\\n]+/, /\\./)), '"'),
  },
});
