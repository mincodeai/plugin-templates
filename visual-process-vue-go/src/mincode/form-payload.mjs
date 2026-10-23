import { pluginMessages } from './messages.mjs';

export function buildPayload(config, values, _action, locale = 'zh') {
  const copy = pluginMessages(locale);
  const payload = {};
  for (const field of config.fields) {
    const value = values[field.id];
    if (field.id === 'root' && !String(value || '').trim()) throw new Error(copy.requiredRoot);
    if (field.type === 'json') {
      try { payload[field.id] = JSON.parse(value || '{}'); }
      catch { throw new Error(`${field.label}: ${copy.invalidJSON}`); }
      if (!payload[field.id] || typeof payload[field.id] !== 'object' || Array.isArray(payload[field.id])) throw new Error(`${field.label}: ${copy.jsonObject}`);
    } else payload[field.id] = typeof value === 'string' ? value.trim() : value;
  }
  return payload;
}
