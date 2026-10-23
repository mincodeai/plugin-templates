#!/usr/bin/env node
// A dependency-free Language Server Protocol server for the made-up mcdemo
// language (contributes.languageServers). MinCode starts it as
// `node ${pluginRoot}/lib/mcdemo-lsp.mjs --stdio` in the project root after the
// user enables and confirms it. It speaks LSP over stdin/stdout with
// Content-Length framing and provides diagnostics (the same rules as the
// `lint` action), keyword completion and keyword hover. It never reads files:
// documents arrive through didOpen/didChange.
import { KEYWORDS, lintMcdemo } from '../bin/lint.mjs';

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const SEVERITY = { error: 1, warning: 2, info: 3, hint: 4 };
const TAGS = { unnecessary: 1, deprecated: 2 };

const documents = new Map();
let shuttingDown = false;
let buffer = Buffer.alloc(0);

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function publishDiagnostics(uri, version) {
  const text = documents.get(uri)?.text;
  const diagnostics = text === undefined ? [] : lintMcdemo(text).map(item => ({
    range: {
      start: { line: item.startLineNumber - 1, character: item.startColumn - 1 },
      end: { line: item.endLineNumber - 1, character: item.endColumn - 1 },
    },
    severity: SEVERITY[item.severity],
    code: item.code,
    source: item.source,
    message: item.message,
    ...(item.tags ? { tags: item.tags.map(tag => TAGS[tag]) } : {}),
  }));
  send({ method: 'textDocument/publishDiagnostics', params: { uri, ...(Number.isInteger(version) ? { version } : {}), diagnostics } });
}

function wordAt(uri, position) {
  const text = documents.get(uri)?.text;
  if (text === undefined || !position) return null;
  const line = text.split(/\r?\n/)[position.line];
  if (line === undefined) return null;
  let start = Math.min(position.character, line.length);
  let end = start;
  while (start > 0 && /[A-Za-z_]/.test(line[start - 1])) start -= 1;
  while (end < line.length && /[A-Za-z_]/.test(line[end])) end += 1;
  return start === end ? null : { word: line.slice(start, end), line: position.line, start, end };
}

const handlers = {
  initialize: () => ({
    capabilities: {
      textDocumentSync: { openClose: true, change: 1 },
      completionProvider: { triggerCharacters: [] },
      hoverProvider: true,
    },
    serverInfo: { name: 'mcdemo-lsp', version: '0.1.0' },
  }),
  shutdown: () => {
    shuttingDown = true;
    return null;
  },
  'textDocument/completion': () => ({
    isIncomplete: false,
    items: Object.entries(KEYWORDS).map(([label, documentation]) => ({ label, kind: 14, detail: 'mcdemo keyword', documentation })),
  }),
  'textDocument/hover': params => {
    const hit = wordAt(params?.textDocument?.uri, params?.position);
    if (!hit || !Object.hasOwn(KEYWORDS, hit.word)) return null;
    return {
      contents: { kind: 'plaintext', value: KEYWORDS[hit.word] },
      range: { start: { line: hit.line, character: hit.start }, end: { line: hit.line, character: hit.end } },
    };
  },
};

const notifications = {
  exit: () => process.exit(shuttingDown ? 0 : 1),
  'textDocument/didOpen': params => {
    const doc = params?.textDocument;
    if (typeof doc?.uri !== 'string' || typeof doc.text !== 'string') return;
    documents.set(doc.uri, { text: doc.text });
    publishDiagnostics(doc.uri, doc.version);
  },
  'textDocument/didChange': params => {
    const uri = params?.textDocument?.uri;
    const changes = params?.contentChanges;
    if (!documents.has(uri) || !Array.isArray(changes) || changes.length === 0) return;
    // Full synchronisation (change: 1): the last change carries the whole text.
    const text = changes[changes.length - 1]?.text;
    if (typeof text !== 'string') return;
    documents.set(uri, { text });
    publishDiagnostics(uri, params.textDocument.version);
  },
  'textDocument/didClose': params => {
    const uri = params?.textDocument?.uri;
    if (!documents.delete(uri)) return;
    send({ method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [] } });
  },
};

function dispatch(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  const isRequest = message.id !== undefined && message.id !== null;
  if (!isRequest) {
    notifications[message.method]?.(message.params);
    return;
  }
  if (shuttingDown && message.method !== 'shutdown') {
    send({ id: message.id, error: { code: -32600, message: 'Server is shutting down' } });
    return;
  }
  const handler = Object.hasOwn(handlers, message.method) ? handlers[message.method] : undefined;
  if (!handler) {
    send({ id: message.id, error: { code: -32601, message: `Unsupported method: ${message.method}` } });
    return;
  }
  try {
    send({ id: message.id, result: handler(message.params) });
  } catch (error) {
    send({ id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' } });
  }
}

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) {
      if (buffer.length > 8192) process.exit(1);
      return;
    }
    const match = /content-length:\s*(\d+)/i.exec(buffer.subarray(0, headerEnd).toString('ascii'));
    const length = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(length) || length > MAX_MESSAGE_BYTES) process.exit(1);
    if (buffer.length < headerEnd + 4 + length) return;
    const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8');
    buffer = buffer.subarray(headerEnd + 4 + length);
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      send({ id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    dispatch(message);
  }
});
process.stdin.on('end', () => process.exit(shuttingDown ? 0 : 1));
