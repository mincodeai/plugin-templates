// Tree view, language feature and test provider logic for the mcdemo language.
// The project scan reads only regular files under project.root (sent because
// the plugin declares workspace.read) and never follows symbolic links.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { KEYWORDS } from './lint.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'vendor', '.idea', '.vscode', 'target', 'out']);
const MAX_SCAN_DEPTH = 6;
const MAX_SCAN_ENTRIES = 5000;
const MAX_FILES = 200;
const MAX_FILE_BYTES = 256 * 1024;
// Tree item ids (`t:<path>#<line>`) are at most 128 bytes.
const MAX_PATH_LENGTH = 100;

const TASK_LINE = /^\s*task\s+([A-Za-z0-9_.-]+)\s*$/;
const BLOCK_OPEN = /^\s*(task|when)\b/;
const BLOCK_END = /^\s*end\s*$/;
const FLAG_LINE = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=/;
const WORD = /[A-Za-z0-9_.-]/;

const zh = locale => typeof locale === 'string' && locale.toLowerCase().startsWith('zh');

/** Lists project-relative `/`-separated paths of .mcdemo files, sorted. */
export async function findMcdemoFiles(root) {
  const files = [];
  let visited = 0;
  async function walk(directory, relative, depth) {
    if (depth > MAX_SCAN_DEPTH || files.length >= MAX_FILES) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES || ++visited > MAX_SCAN_ENTRIES) return;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(path.join(directory, entry.name), child, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.mcdemo') && Buffer.byteLength(child) <= MAX_PATH_LENGTH) {
        files.push(child);
      }
    }
  }
  await walk(root, '', 0);
  return files;
}

async function readProjectFile(root, relative) {
  const file = path.join(root, ...relative.split('/'));
  const inside = path.relative(root, file);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return null;
  return readFile(file, 'utf8').catch(() => null);
}

/** Parses `task <name> … end` blocks; body lines exclude the task and end lines. */
export function parseTasks(text) {
  const lines = text.split(/\r?\n/);
  const tasks = [];
  let current = null;
  let depth = 0;
  lines.forEach((line, index) => {
    const code = line.replace(/#.*$/, '');
    const task = TASK_LINE.exec(code);
    if (task && depth === 0) {
      current = { name: task[1], line: index + 1, body: [] };
      tasks.push(current);
      depth = 1;
      return;
    }
    if (BLOCK_OPEN.test(code)) depth += 1;
    else if (BLOCK_END.test(code)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) { current = null; return; }
    }
    if (current) current.body.push(line);
  });
  return tasks;
}

const scanProject = async project => {
  const root = project?.root;
  if (typeof root !== 'string' || !path.isAbsolute(root)) return null;
  return { root, files: await findMcdemoFiles(root) };
};

// ---------------------------------------------------------------- tree view

const LINKS = [
  { id: 'link:counter', label: { en: 'Show the showcase counter', zh: '查看示例计数器' }, icon: 'gear',
    target: { type: 'command', command: 'contributions-process-showcase.show' } },
  { id: 'link:docs', label: { en: 'Plugin documentation (example.com)', zh: '插件文档（example.com）' }, icon: 'link',
    target: { type: 'url', url: 'https://example.com/mincode/plugins' } },
];

/** {view, parent, locale, project?} => {items}. */
export async function treeChildren({ parent, locale, project }) {
  const language = zh(locale) ? 'zh' : 'en';
  if (parent === null || parent === undefined) {
    const scan = await scanProject(project);
    const items = [{ id: 'links', label: language === 'zh' ? '示例链接' : 'Example links', icon: 'link', collapsible: true }];
    if (!scan) {
      items.push({ id: 'no-project', label: language === 'zh' ? '打开项目后显示 .mcdemo 文件' : 'Open a project to list .mcdemo files', icon: 'info' });
    } else if (scan.files.length === 0) {
      items.push({ id: 'no-files', label: language === 'zh' ? '项目中没有 .mcdemo 文件' : 'No .mcdemo files in this project', icon: 'info' });
    }
    for (const file of scan?.files ?? []) {
      const name = file.slice(file.lastIndexOf('/') + 1);
      const folder = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      items.push({ id: `f:${file}`, label: name, description: folder || undefined, tooltip: file, icon: 'file', collapsible: true });
    }
    return { items };
  }
  if (parent === 'links') {
    return { items: LINKS.map(link => ({ id: link.id, label: link.label[language], icon: link.icon, target: link.target })) };
  }
  if (typeof parent === 'string' && parent.startsWith('f:')) {
    const relative = parent.slice(2);
    const root = project?.root;
    const text = typeof root === 'string' ? await readProjectFile(root, relative) : null;
    if (text === null) return { items: [] };
    const items = parseTasks(text).slice(0, 200).map(task => ({
      id: `t:${relative}#${task.line}`,
      label: task.name,
      description: language === 'zh' ? `第 ${task.line} 行` : `line ${task.line}`,
      icon: 'function',
      target: { type: 'file', path: relative, line: task.line },
    }));
    return { items };
  }
  return { items: [] };
}

// ---------------------------------------------------------- language feature

function wordAt(line, column) {
  let start = Math.max(0, column - 1);
  let end = start;
  while (start > 0 && WORD.test(line[start - 1])) start -= 1;
  while (end < line.length && WORD.test(line[end])) end += 1;
  return line.slice(start, end);
}

/**
 * {provider, feature, languageId, text, startLine, position: {line, column}, locale}
 * => hover {contents} or completion {items}. `text` may be a window that starts
 * at document line `startLine`.
 */
export function languageFeature({ feature, text, startLine, position, locale }) {
  const language = zh(locale) ? 'zh' : 'en';
  const lines = text.split(/\r?\n/);
  const offset = Number.isSafeInteger(startLine) && startLine >= 1 ? startLine : 1;
  const current = lines[position.line - offset] ?? '';
  if (feature === 'hover') {
    const word = wordAt(current, position.column);
    if (!word) return { contents: [] };
    if (Object.hasOwn(KEYWORDS, word)) return { contents: [`mcdemo: ${word}`, KEYWORDS[word]] };
    const task = parseTasks(text).find(entry => entry.name === word);
    if (task) {
      const line = task.line + offset - 1;
      return { contents: [language === 'zh' ? `任务 ${word}（第 ${line} 行，${task.body.length} 行代码）` : `Task ${word} (line ${line}, ${task.body.length} body lines)`] };
    }
    return { contents: [] };
  }
  if (feature === 'completion') {
    const items = Object.entries(KEYWORDS).map(([keyword, help]) => ({
      label: keyword, kind: 'keyword', detail: language === 'zh' ? 'mcdemo 关键字' : 'mcdemo keyword', documentation: help,
      insertText: keyword === 'run' ? 'run ""' : keyword,
    }));
    const flags = new Set();
    for (const line of lines) {
      const flag = FLAG_LINE.exec(line);
      if (flag && !Object.hasOwn(KEYWORDS, flag[1])) flags.add(flag[1]);
    }
    for (const flag of flags) {
      items.push({ label: flag, kind: 'variable', detail: language === 'zh' ? '本文件中的开关' : 'Flag defined in this file' });
    }
    return { items: items.slice(0, 100) };
  }
  throw Object.assign(new Error('unknown feature'), { code: -32602 });
}

// ------------------------------------------------------------ test provider

/** {provider, locale, project: {name, root}} => {tests}. One node per file, one child per task. */
export async function discoverTests({ project }) {
  const scan = await scanProject(project);
  if (!scan) return { tests: [] };
  const tests = [];
  for (const file of scan.files) {
    const text = await readProjectFile(scan.root, file);
    if (text === null) continue;
    const children = parseTasks(text).map(task => ({ id: `${file}#${task.name}`, label: task.name, path: file, line: task.line }));
    if (children.length > 0) tests.push({ id: file, label: file, path: file, children });
  }
  return { tests };
}

// A made-up rule set so every status shows up in the Tests tab:
// tasks named skip-* or wip-* are skipped, a task without a run line errors,
// a task containing TODO or `run "false"` fails, everything else passes.
function judge(task) {
  const body = task.body.join('\n');
  if (/^(skip|wip)[-_.]/.test(task.name)) return { status: 'skipped', message: 'Skipped by name (skip-* / wip-*).' };
  if (!/^\s*run\b/m.test(body)) return { status: 'errored', message: 'Task has no run line.' };
  if (/\bTODO\b/.test(body) || /run\s+"false"/.test(body)) return { status: 'failed', message: 'Task still has a TODO or runs "false".' };
  return { status: 'passed' };
}

/** {provider, locale, project, tests: [id]} => {results, output}. An empty list runs everything. */
export async function runTests(payload) {
  const wanted = new Set(Array.isArray(payload?.tests) ? payload.tests : []);
  const { tests } = await discoverTests(payload ?? {});
  const results = [];
  const output = [];
  for (const suite of tests) {
    const text = await readProjectFile(payload.project.root, suite.path);
    const parsed = new Map(parseTasks(text ?? '').map(task => [`${suite.path}#${task.name}`, task]));
    for (const child of suite.children) {
      if (wanted.size > 0 && !wanted.has(child.id) && !wanted.has(suite.id)) continue;
      const task = parsed.get(child.id);
      if (!task) continue;
      const verdict = judge(task);
      const durationMs = 5 + task.body.length * 3;
      results.push({ id: child.id, ...verdict, durationMs });
      output.push(`${verdict.status.toUpperCase().padEnd(7)} ${child.id} (${durationMs} ms)${verdict.message ? ` - ${verdict.message}` : ''}`);
    }
  }
  const count = status => results.filter(result => result.status === status).length;
  output.push('', `${results.length} tasks: ${count('passed')} passed, ${count('failed')} failed, ${count('errored')} errored, ${count('skipped')} skipped`);
  return { results, output: output.join('\n') };
}
