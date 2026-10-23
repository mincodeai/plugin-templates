// Pure formatter for the made-up mcdemo language (see the contributions-showcase
// template): trims trailing whitespace and re-indents task/when/else/end blocks.

const OPEN = new Set(['task', 'when']);

/**
 * @param {string} text whole document
 * @param {{tabSize: number, insertSpaces: boolean, eol: string}} options
 * @param {{startLineNumber: number, endLineNumber: number} | undefined} range 1-based; only these lines change
 * @returns {string} the whole formatted document (the host applies a minimal edit)
 */
export function formatMcdemo(text, options, range) {
  const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  const lines = text.split(/\r?\n/);
  const first = range ? range.startLineNumber - 1 : 0;
  const last = range ? range.endLineNumber - 1 : lines.length - 1;
  let depth = 0;
  const out = lines.map((line, index) => {
    const content = line.trim();
    const keyword = content.split(/\s/, 1)[0];
    let indent = depth;
    if (keyword === 'end') {
      depth = Math.max(0, depth - 1);
      indent = depth;
    } else if (keyword === 'else') {
      indent = Math.max(0, depth - 1);
    } else if (OPEN.has(keyword)) {
      depth += 1;
    }
    if (index < first || index > last) return line;
    return content ? unit.repeat(indent) + content : '';
  });
  return out.join(options.eol);
}
