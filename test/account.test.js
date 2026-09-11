import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    login, logout, listAccounts, resetAccount,
    getCurrentAccount, isLoggedIn, flush, flushNow, hasPendingChanges, FLUSH_DELAY_MS, RETRY_DELAY_MS,
    getSyncStatus, onSyncChange
} from '../src/account.js';
import { getInt, setInt, remove, getAllValues } from '../src/storage.js';
import { addCoins, getCoinCount } from '../src/currency.js';

// A fake server: records every request and answers like server/api.js.
function fakeServer(overrides = {}) {
    const calls = [];
    const state = { Olle: { coinCount: '5' } };
    const fetchMock = vi.fn(async (url, options = {}) => {
        const body = options.body ? JSON.parse(options.body) : {};
        calls.push({ url: String(url), body });
        const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
        if (overrides[url]) return overrides[url](body, reply);
        if (url === '/api/accounts') return reply(200, [{ name: 'Olle', pokemonCount: 3 }]);
        if (url === '/api/login') {
            const created = !state[body.name];
            state[body.name] = state[body.name] || {};
            return reply(200, { name: body.name, created, state: state[body.name] });
        }
        if (url === '/api/state') {
            for (const [k, v] of Object.entries(body.changes)) {
                if (v === null) delete state[body.name][k]; else state[body.name][k] = v;
            }
            return reply(200, { ok: true, saved: Object.keys(body.changes).length });
        }
        if (url === '/api/reset') { state[body.name] = {}; return reply(200, { ok: true }); }
        return reply(404, { error: 'nope' });
    });
    globalThis.fetch = fetchMock;
    return { calls, state, fetchMock };
}

describe('account sync', () => {
    let originalFetch;
    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
    });

    it('login loads the account state and remembers the name on the device', async () => {
        fakeServer();
        expect(isLoggedIn()).toBe(false);
        const result = await login('Olle');
        expect(result).toEqual({ name: 'Olle', created: false });
        expect(isLoggedIn()).toBe(true);
        expect(getCurrentAccount()).toBe('Olle');
        expect(localStorage.getItem('accountName')).toBe('Olle');
        expect(getCoinCount()).toBe(5);
    });

    it('batches writes into one request after a short delay', async () => {
        const server = fakeServer();
        await login('Olle');
        addCoins(3);
        setInt('streakMultiplier', 2);
        remove('streakMultiplier');
        expect(hasPendingChanges()).toBe(true);
        expect(server.calls.filter(c => c.url === '/api/state')).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        const saves = server.calls.filter(c => c.url === '/api/state');
        expect(saves).toHaveLength(1);
        expect(saves[0].body).toEqual({ name: 'Olle', changes: { coinCount: '8', streakMultiplier: null } });
        expect(hasPendingChanges()).toBe(false);
        expect(server.state.Olle).toEqual({ coinCount: '8' });
    });

    it('keeps changes queued and retries when the server is unreachable', async () => {
        let failures = 1;
        const server = fakeServer({
            '/api/state': (body, reply) => {
                if (failures-- > 0) throw new Error('network down');
                return reply(200, { ok: true, saved: 1 });
            }
        });
        await login('Olle');
        addCoins(1);
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(hasPendingChanges()).toBe(true);
        addCoins(1); // written while the retry is pending wins over the failed batch
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 1);
        expect(hasPendingChanges()).toBe(false);
        const saves = server.calls.filter(c => c.url === '/api/state');
        expect(saves).toHaveLength(2);
        expect(saves[1].body.changes).toEqual({ coinCount: '7' });
    });

    it('a rejected save (e.g. 404) is retried too', async () => {
        const server = fakeServer({ '/api/state': (body, reply) => reply(500, { error: 'boom' }) });
        await login('Olle');
        addCoins(1);
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(hasPendingChanges()).toBe(true);
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 1);
        expect(server.calls.filter(c => c.url === '/api/state')).toHaveLength(2);
    });

    it('flushNow sends whatever is queued with sendBeacon', async () => {
        const server = fakeServer();
        const beacon = vi.fn(() => true);
        navigator.sendBeacon = beacon;
        try {
            await login('Olle');
            addCoins(2);
            flushNow();
            expect(beacon).toHaveBeenCalledTimes(1);
            expect(beacon.mock.calls[0][0]).toBe('/api/state');
            expect(hasPendingChanges()).toBe(false);
            await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
            expect(server.calls.filter(c => c.url === '/api/state')).toHaveLength(0);
        } finally {
            delete navigator.sendBeacon;
        }
    });

    it('logout forgets the device name and stops syncing', async () => {
        const server = fakeServer();
        await login('Olle');
        logout();
        expect(getCurrentAccount()).toBeNull();
        expect(isLoggedIn()).toBe(false);
        expect(getAllValues()).toEqual({});
        setInt('coinCount', 99);
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(server.calls.filter(c => c.url === '/api/state')).toHaveLength(0);
    });

    it('lists accounts and resets the current one', async () => {
        const server = fakeServer();
        expect(await listAccounts()).toEqual([{ name: 'Olle', pokemonCount: 3 }]);
        await login('Olle');
        await resetAccount();
        expect(server.calls.find(c => c.url === '/api/reset').body).toEqual({ name: 'Olle' });
        expect(getCoinCount()).toBe(0);
    });

    it('reports the sync status as changes are queued, posted and confirmed', async () => {
        fakeServer();
        await login('Olle');
        const seen = [];
        const stop = onSyncChange(status => seen.push(status));
        expect(getSyncStatus()).toBe('saved');
        addCoins(1);
        expect(getSyncStatus()).toBe('pending');
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(getSyncStatus()).toBe('saved');
        expect(seen).toEqual(['pending', 'saving', 'saved']);
        stop();
    });

    it('reports an error while a failed save waits for its retry', async () => {
        let fail = true;
        fakeServer({ '/api/state': (body, reply) => (fail ? reply(500, { error: 'down' }) : reply(200, { ok: true })) });
        await login('Olle');
        addCoins(1);
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(getSyncStatus()).toBe('error');
        fail = false;
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 1);
        expect(getSyncStatus()).toBe('saved');
    });

    it('surfaces server errors from login', async () => {
        fakeServer({ '/api/login': (body, reply) => reply(400, { error: 'A name is required' }) });
        await expect(login('')).rejects.toThrow('A name is required');
        expect(isLoggedIn()).toBe(false);
    });
});
