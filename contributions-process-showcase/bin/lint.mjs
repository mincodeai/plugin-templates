// Pure lint rules for the made-up mcdemo language (see the contributions-showcase
// template). Used by the `lint` action (linters contribution) and by the
// dependency-free language server in lib/mcdemo-lsp.mjs.

export const MAX_LINE_LENGTH = 120;
export const MAX_DIAGNOSTICS = 500;

const TODO = /\bTODO\b/g;
const TRAILING = /[ \t]+$/;

/**
 * @param {string} text whole document
 * @returns {Array<{startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number,
 *   severity: 'error' | 'warning' | 'info' | 'hint', message: string, code: string, source: string, tags?: string[]}>}
 *   1-based Monaco ranges; columns count UTF-16 code units like the editor does.
 */
export function lintMcdemo(text) {
  const diagnostics = [];
  const push = diagnostic => {
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ ...diagnostic, source: 'mcdemo' });
  };
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length && diagnostics.length < MAX_DIAGNOSTICS; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    for (const match of line.matchAll(TODO)) {
      push({
        startLineNumber: lineNumber, startColumn: match.index + 1, endLineNumber: lineNumber, endColumn: match.index + 5,
        severity: 'info', code: 'todo', message: 'TODO left in the file.',
      });
    }
    const trailing = TRAILING.exec(line);
    if (trailing) {
      push({
        startLineNumber: lineNumber, startColumn: trailing.index + 1, endLineNumber: lineNumber, endColumn: line.length + 1,
        severity: 'warning', code: 'trailing-whitespace', message: 'Trailing whitespace.', tags: ['unnecessary'],
      });
    }
    if (line.length > MAX_LINE_LENGTH) {
      push({
        startLineNumber: lineNumber, startColumn: MAX_LINE_LENGTH + 1, endLineNumber: lineNumber, endColumn: line.length + 1,
        severity: 'warning', code: 'line-too-long', message: `Line is ${line.length} characters long; keep lines at most ${MAX_LINE_LENGTH}.`,
      });
    }
  }
  return diagnostics;
}

/** Keywords of the mcdemo language, with the hover text the language server shows. */
export const KEYWORDS = {
  task: 'task <name> … end: declares a task. Indent its body one level.',
  run: 'run "<command>": runs a shell command inside a task.',
  when: 'when <flag> … [else …] end: runs the block only when the flag is true.',
  else: 'else: the branch of a when block used when the flag is false.',
  end: 'end: closes the nearest task or when block.',
  true: 'true: boolean literal.',
  false: 'false: boolean literal.',
};
