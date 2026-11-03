/* global document */
// Applies the `--app-*` tokens of a contributed host theme (contributes.themes)
// that arrive in the host context. The host already validated them; this
// re-checks names and values and writes them through CSSOM only, so no
// context value is ever parsed as CSS text. Tokens from a previous theme are
// removed when the theme changes.
const TOKEN_NAME = /^--app-[a-z0-9-]{1,40}$/;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_TRIPLET = /^\d{1,3}, \d{1,3}, \d{1,3}$/;
const MAX_TOKENS = 64;
let applied = [];

export function validThemeTokens(tokens) {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return {};
  const valid = {};
  for (const [name, value] of Object.entries(tokens).slice(0, MAX_TOKENS)) {
    if (!TOKEN_NAME.test(name) || typeof value !== 'string') continue;
    if (name === '--app-accent-rgb' ? RGB_TRIPLET.test(value) : HEX_COLOR.test(value)) valid[name] = value;
  }
  return valid;
}

export function applyThemeTokens(tokens, root) {
  const valid = validThemeTokens(tokens);
  // Nothing to set or remove: leave the document untouched (and unread).
  if (applied.length === 0 && Object.keys(valid).length === 0) return;
  root ??= document.documentElement;
  for (const name of applied) if (!(name in valid)) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(valid)) root.style.setProperty(name, value);
  applied = Object.keys(valid);
}
