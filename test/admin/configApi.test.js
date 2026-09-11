import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readDefaultConfig } from '../helpers/setup.js';
import { loadMinigameConfig } from '../../src/minigameConfig.js';
import {
    getConfig, saveConfig, resetConfigCache, setConfigSaveAvailable, isConfigSaveAvailable,
    CONFIG_URL, SAVE_URL, SAVE_UNAVAILABLE_MESSAGE
} from '../../src/admin/configApi.js';

// A stateful stand-in for the dev server: POST /api/config/save stores the
// body, GET /config/minigames.json returns what was last stored.
let stored;
let posts;
let failNextPost;
const baseImpl = fetch.getMockImplementation();

function json(body, status = 200) {
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
    stored = readDefaultConfig();
    posts = [];
    failNextPost = false;
    resetConfigCache();
    setConfigSaveAvailable(true);
    fetch.mockClear();
    fetch.mockImplementation(async (url, options = {}) => {
        const str = String(url);
        if (str.startsWith(SAVE_URL) && options.method === 'POST') {
            posts.push(JSON.parse(options.body));
            if (failNextPost) {
                failNextPost = false;
                return json({ success: false }, 500);
            }
            stored = JSON.parse(options.body);
            return json({ success: true });
        }
        if (str.startsWith(CONFIG_URL)) return json(stored);
        return baseImpl(url, options);
    });
});

afterEach(() => {
    fetch.mockImplementation(baseImpl);
    setConfigSaveAvailable(null);
    resetConfigCache();
});

describe('admin configApi', () => {
    it('getConfig loads once and caches', async () => {
        const a = await getConfig();
        const b = await getConfig();
        expect(a).toBe(b);
        expect(a.weights).toBeTypeOf('object');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('saveConfig merges a patch over the fetched config and posts once', async () => {
        const original = readDefaultConfig();
        const saved = await saveConfig({ addition: { numberOfTerms: 3, maxSum: 50, onlyOneMultiDigit: false } });
        expect(posts).toHaveLength(1);
        expect(posts[0]).toEqual({ ...original, addition: { numberOfTerms: 3, maxSum: 50, onlyOneMultiDigit: false } });
        expect(saved).toEqual(posts[0]);
        // Other sections are untouched.
        expect(posts[0].weights).toEqual(original.weights);
        expect(posts[0].letters).toEqual(original.letters);
        // The cached copy now reflects the save.
        expect((await getConfig()).addition.maxSum).toBe(50);
    });

    it('serializes concurrent saves so neither clobbers the other', async () => {
        const [a, b] = await Promise.all([
            saveConfig({ letters: { letters: 'a-f' } }),
            saveConfig({ dayMatch: { maxErrors: 7 } })
        ]);
        expect(posts).toHaveLength(2);
        expect(posts[0].letters).toEqual({ letters: 'a-f' });
        expect(posts[0].dayMatch).toEqual(readDefaultConfig().dayMatch);
        // The second save was built on top of the first one's result.
        expect(posts[1].letters).toEqual({ letters: 'a-f' });
        expect(posts[1].dayMatch).toEqual({ maxErrors: 7 });
        expect(a.letters).toEqual({ letters: 'a-f' });
        expect(b.letters).toEqual({ letters: 'a-f' });
        expect(b.dayMatch).toEqual({ maxErrors: 7 });
        expect(stored).toEqual(b);
    });

    it('invalidates the game config cache after a save', async () => {
        const before = await loadMinigameConfig();
        expect(before.dayMatch.maxErrors).toBe(3);
        await saveConfig({ dayMatch: { maxErrors: 9 } });
        const after = await loadMinigameConfig();
        expect(after).not.toBe(before);
        expect(after.dayMatch.maxErrors).toBe(9);
    });

    it('re-reads the file before saving so edits from elsewhere survive', async () => {
        await getConfig();
        // Another device saved in the meantime.
        stored = { ...stored, legendary: { coinReward: 555, maxErrors: 1 } };
        await saveConfig({ dayMatch: { maxErrors: 2 } });
        expect(posts[0].legendary).toEqual({ coinReward: 555, maxErrors: 1 });
        expect(posts[0].dayMatch).toEqual({ maxErrors: 2 });
    });

    it('rejects a failed POST but keeps later saves working', async () => {
        failNextPost = true;
        await expect(saveConfig({ dayMatch: { maxErrors: 4 } })).rejects.toThrow(/500/);
        await expect(saveConfig({ dayMatch: { maxErrors: 5 } })).resolves.toBeTruthy();
        expect(posts).toHaveLength(2);
        expect(stored.dayMatch).toEqual({ maxErrors: 5 });
    });

    it('refuses to save outside the dev server and never posts', async () => {
        setConfigSaveAvailable(false);
        expect(isConfigSaveAvailable()).toBe(false);
        await expect(saveConfig({ dayMatch: { maxErrors: 1 } })).rejects.toThrow(SAVE_UNAVAILABLE_MESSAGE);
        expect(posts).toHaveLength(0);
    });

    it('is available under vitest (import.meta.env.DEV)', () => {
        setConfigSaveAvailable(null);
        expect(isConfigSaveAvailable()).toBe(true);
    });
});
