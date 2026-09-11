// Global test environment: localStorage, fetch for /config, and a window shim.
import fs from 'fs';
import path from 'path';
import { beforeEach, vi } from 'vitest';

const PUBLIC_DIR = path.resolve(__dirname, '../../public');

class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
    setItem(key, value) { this.map.set(String(key), String(value)); }
    removeItem(key) { this.map.delete(key); }
    clear() { this.map.clear(); }
    key(i) { return Array.from(this.map.keys())[i] ?? null; }
    get length() { return this.map.size; }
}

globalThis.localStorage = new MemoryStorage();

// Test-controlled minigame config. Defaults to the checked-in file; tests can
// override individual sections with setTestConfig().
let configOverride = null;
export function setTestConfig(partial) {
    configOverride = partial;
}
export function readDefaultConfig() {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'config/minigames.json'), 'utf8'));
}
function currentConfig() {
    const base = readDefaultConfig();
    return configOverride ? { ...base, ...configOverride } : base;
}

globalThis.fetch = vi.fn(async (url) => {
    const str = String(url);
    if (str.startsWith('/config/minigames.json')) {
        const body = currentConfig();
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }
    if (str.startsWith('/')) {
        const file = path.join(PUBLIC_DIR, str);
        if (fs.existsSync(file)) {
            const text = fs.readFileSync(file, 'utf8');
            return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
        }
        return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
    }
    // External URLs (e.g. the speech-recognition network probe) succeed silently.
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
});

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', onLine: true, platform: 'node', maxTouchPoints: 0 };
}
if (typeof globalThis.location === 'undefined') {
    globalThis.location = { protocol: 'https:', hostname: 'localhost', pathname: '/', origin: 'https://localhost' };
}

// Keep test output readable: the modes log a lot.
const quiet = process.env.TEST_VERBOSE !== '1';
if (quiet) {
    console.log = () => {};
    console.warn = () => {};
}

beforeEach(() => {
    localStorage.clear();
    configOverride = null;
});
