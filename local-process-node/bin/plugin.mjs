#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { start } from '../lib/runtime.mjs';

const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));

start(host => ({
  async hello(payload) {
    if (payload.name !== undefined && (typeof payload.name !== 'string' || payload.name.length > 200)) {
      throw Object.assign(new Error('Name must be a string of at most 200 characters'), { code: -32602 });
    }
    await host('host.log', { level: 'info', message: 'Hello action invoked' });
    return { message: `Hello, ${payload.name ?? 'MinCode'}!`, pluginId: manifest.id };
  },
  async counter() {
    const value = await host('host.storage.get', { key: 'counter' });
    const previous = value === null ? 0 : value;
    if (!Number.isSafeInteger(previous) || previous < 0) throw new Error('Stored counter must be a non-negative safe integer');
    if (previous === Number.MAX_SAFE_INTEGER) throw new Error('Counter limit reached');
    const count = previous + 1;
    if (await host('host.storage.set', { key: 'counter', value: count }) !== true) {
      throw new Error('Host did not confirm counter storage');
    }
    return { count };
  },
}), {
  hostTimeoutMs: 5_000,
  allowNullPayload: true,
  strictPayloadString: true,
  errors: { timeout: 'Host request timed out', busy: 'An action is already running' },
  // Go Invoke unwraps this object once; do not JSON.stringify the action result.
  formatResult: result => ({ result }),
  validateInitialize(params) {
    const version = params?.runtimeProtocolVersion ?? params?.apiVersion;
    if (version !== 1) {
      throw Object.assign(new Error('Unsupported runtime protocol version'), { code: -32602 });
    }
    return { manifestApiVersion: manifest.apiVersion };
  },
});
