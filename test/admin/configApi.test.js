import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readDefaultConfig } from '../helpers/setup.js';
import { loadMinigameConfig, CONFIG_OVERRIDE_KEY } from '../../src/minigameConfig.js';
import { getConfig, saveConfig, resetConfigCache, SAVE_UNAVAILABLE_MESSAGE } from '../../src/admin/configApi.js';
import { login, hasPendingChanges, FLUSH_DELAY_MS, RETRY_DELAY_MS } from '../../src/account.js';
import { getJSON } from '../../src/storage.js';

// A stand-in for the account API: POST /api/state stores the account's keys,
// everything else (the defaults file) goes to the shared test fetch.
let saved;
let posts;
let failNextPost;
let originalFetch;

function json(body, status = 200) {
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(async () => {
    saved = {};
    posts = [];
    failNextPost = false;
    originalFetch = globalThis.fetch;
    const base = originalFetch;
    globalThis.fetch = async (url, options = {}) => {
        const str = String(url);
        if (str === '/api/login') return json({ name: 'Olle', created: false, state: {} });
        if (str === '/api/state') {
            const body = JSON.parse(options.body);
            posts.push(body.changes);
            if (failNextPost) {
                failNextPost = false;
                return json({ error: 'boom' }, 500);
            }
            Object.assign(saved, body.changes);
            return json({ ok: true, saved: Object.keys(body.changes).length });
        }
        return base(url, options);
    };
    resetConfigCache();
    await login('Olle');
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    resetConfigCache();
});

describe('admin configApi', () => {
    it('getConfig loads the defaults once and caches', async () => {
        const a = await getConfig();
        const b = await getConfig();
        expect(a).toBe(b);
        expect(a.weights).toEqual(readDefaultConfig().weights);
    });

    it('saveConfig stores only the patched sections in the account and posts them', async () => {
        const original = readDefaultConfig();
        const patch = { addition: { numberOfTerms: 3, maxSum: 50, onlyOneMultiDigit: false } };
        const merged = await saveConfig(patch);
        expect(posts).toHaveLength(1);
        expect(JSON.parse(posts[0][CONFIG_OVERRIDE_KEY])).toEqual(patch);
        expect(JSON.parse(saved[CONFIG_OVERRIDE_KEY])).toEqual(patch);
        // The merged view keeps every other section from the defaults.
        expect(merged.addition).toEqual(patch.addition);
        expect(merged.weights).toEqual(original.weights);
        expect(merged.letters).toEqual(original.letters);
        expect((await getConfig()).addition.maxSum).toBe(50);
    });

    it('serializes concurrent saves so neither clobbers the other', async () => {
        const [a, b] = await Promise.all([
            saveConfig({ letters: { letters: 'a-f' } }),
            saveConfig({ dayMatch: { maxErrors: 7 } })
        ]);
        expect(a.letters).toEqual({ letters: 'a-f' });
        expect(b.letters).toEqual({ letters: 'a-f' });
        expect(b.dayMatch).toEqual({ maxErrors: 7 });
        expect(JSON.parse(saved[CONFIG_OVERRIDE_KEY])).toEqual({ letters: { letters: 'a-f' }, dayMatch: { maxErrors: 7 } });
    });

    it('the game sees the saved override on its next config load', async () => {
        const before = await loadMinigameConfig();
        expect(before.dayMatch.maxErrors).toBe(3);
        await saveConfig({ dayMatch: { maxErrors: 9 } });
        const after = await loadMinigameConfig();
        expect(after).not.toBe(before);
        expect(after.dayMatch.maxErrors).toBe(9);
    });

    it('rejects when the server refuses, keeps the change queued, and later saves still work', async () => {
        failNextPost = true;
        await expect(saveConfig({ dayMatch: { maxErrors: 4 } })).rejects.toThrow(SAVE_UNAVAILABLE_MESSAGE);
        expect(hasPendingChanges()).toBe(true);
        // The override is already in the account state, so the game would use it.
        expect(getJSON(CONFIG_OVERRIDE_KEY).dayMatch.maxErrors).toBe(4);
        await expect(saveConfig({ dayMatch: { maxErrors: 5 } })).resolves.toBeTruthy();
        expect(hasPendingChanges()).toBe(false);
        expect(JSON.parse(saved[CONFIG_OVERRIDE_KEY]).dayMatch).toEqual({ maxErrors: 5 });
    });

    it('does not wait for the batching delay', async () => {
        const start = Date.now();
        await saveConfig({ dayMatch: { maxErrors: 2 } });
        expect(Date.now() - start).toBeLessThan(Math.min(FLUSH_DELAY_MS, RETRY_DELAY_MS));
        expect(posts).toHaveLength(1);
    });
});
