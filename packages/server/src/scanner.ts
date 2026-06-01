// Lightweight lexical helpers used to classify the cursor context for
// completion and to locate the word under the cursor for hover. These work on
// a single line of text; `.wcode` statements are line-oriented in practice.

const IDENT_TAIL = /[A-Za-z_][A-Za-z0-9_]*$/;

export interface Prefix {
  /** The full line text. */
  line: string;
  /** Line text before the cursor. */
  before: string;
  /** True if the cursor is inside a `//` line comment. */
  inComment: boolean;
  /** True if the cursor is inside an (unterminated) string literal. */
  inString: boolean;
  /** The identifier currently being typed (possibly empty). */
  word: string;
  /** Character index where `word` begins. */
  wordStart: number;
}

/** Analyze the line up to `character`. */
export function getPrefix(line: string, character: number): Prefix {
  const before = line.slice(0, character);
  let inString = false;
  let inComment = false;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "/" && before[i + 1] === "/") {
      inComment = true;
      break;
    }
  }
  const m = IDENT_TAIL.exec(before);
  const word = m ? m[0] : "";
  return { line, before, inComment, inString, word, wordStart: character - word.length };
}

/** The line prefix with the in-progress word removed. */
export function stem(p: Prefix): string {
  return p.before.slice(0, p.wordStart);
}

/** The identifier spanning `character`, with its bounds, or null. */
export function wordAt(
  line: string,
  character: number,
): { word: string; start: number; end: number } | null {
  const leftM = IDENT_TAIL.exec(line.slice(0, character));
  const rightM = /^[A-Za-z0-9_]*/.exec(line.slice(character));
  const left = leftM ? leftM[0] : "";
  const right = rightM ? rightM[0] : "";
  const word = left + right;
  if (!word) return null;
  const start = character - left.length;
  return { word, start, end: start + word.length };
}

/** The non-space character immediately before `index`, or "". */
export function charBefore(line: string, index: number): string {
  let i = index - 1;
  while (i >= 0 && line[i] === " ") i--;
  return i >= 0 ? line[i] : "";
}

/** Split a document into lines (CRLF/LF tolerant). */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}
