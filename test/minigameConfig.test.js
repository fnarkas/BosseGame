import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    loadMinigameConfig, loadModeConfig, invalidateMinigameConfig,
    getAccountConfigOverride, setAccountConfigOverride, CONFIG_OVERRIDE_KEY
} from '../src/minigameConfig.js';
import { setJSON } from '../src/storage.js';
import { setTestConfig } from './helpers/setup.js';

describe('minigameConfig', () => {
    beforeEach(() => {
        invalidateMinigameConfig();
        fetch.mockClear();
    });

    it('fetches the file once and shares the result', async () => {
        const [a, b] = await Promise.all([loadMinigameConfig(), loadMinigameConfig()]);
        expect(a).toBe(b);
        expect(a.weights).toBeTypeOf('object');
        expect(fetch).toHaveBeenCalledTimes(1);
        await loadModeConfig('addition', { maxSum: 1 });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('merges only known keys and coerces to the default types', async () => {
        setTestConfig({ addition: { numberOfTerms: '3', maxSum: 'abc', onlyOneMultiDigit: 'false', junk: 1 } });
        const cfg = await loadModeConfig('addition', { numberOfTerms: 2, maxSum: 99, onlyOneMultiDigit: true, label: 'x' });
        expect(cfg).toEqual({ numberOfTerms: 3, maxSum: 99, onlyOneMultiDigit: false, label: 'x' });
    });

    it('returns defaults when the section is missing or the fetch fails', async () => {
        expect(await loadModeConfig('noSuchSection', { a: 1 })).toEqual({ a: 1 });
        invalidateMinigameConfig();
        fetch.mockImplementationOnce(async () => { throw new Error('offline'); });
        expect(await loadMinigameConfig()).toEqual({});
        invalidateMinigameConfig();
        fetch.mockImplementationOnce(async () => ({ ok: false, status: 500 }));
        expect(await loadModeConfig('addition', { maxSum: 5 })).toEqual({ maxSum: 5 });
    });

    it('is re-fetched after invalidation', async () => {
        await loadMinigameConfig();
        invalidateMinigameConfig();
        await loadMinigameConfig();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('lets the account override replace whole sections of the defaults', async () => {
        const defaults = await loadMinigameConfig();
        setAccountConfigOverride({ dayMatch: { maxErrors: 9 }, weights: { addition: 100 }, junk: 'no', arr: [1] });
        expect(getAccountConfigOverride()).toEqual({ dayMatch: { maxErrors: 9 }, weights: { addition: 100 } });
        const cfg = await loadMinigameConfig();
        expect(cfg.dayMatch).toEqual({ maxErrors: 9 });
        expect(cfg.weights).toEqual({ addition: 100 });
        expect(cfg.addition).toEqual(defaults.addition);
        expect(await loadModeConfig('dayMatch', { maxErrors: 3 })).toEqual({ maxErrors: 9 });
        // A corrupt stored override is ignored.
        setJSON(CONFIG_OVERRIDE_KEY, [1, 2]);
        invalidateMinigameConfig();
        expect((await loadMinigameConfig()).dayMatch).toEqual(defaults.dayMatch);
    });
});
