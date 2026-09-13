import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { remoteLog, flushRemoteLog, REMOTE_LOG_DELAY_MS, _resetRemoteLogForTests } from '../src/remoteLog.js';

describe('remoteLog', () => {
    let originalFetch;
    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.useFakeTimers();
        _resetRemoteLogForTests();
    });
    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
    });

    it('batches events and posts them once, with the user agent only the first time', async () => {
        const calls = [];
        globalThis.fetch = vi.fn(async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true }; });
        remoteLog('speech', 'start');
        remoteLog('speech', 'error', { error: 'network' });
        expect(calls).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(REMOTE_LOG_DELAY_MS + 1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('/api/log');
        expect(calls[0].body.ua).toBeTruthy();
        expect(calls[0].body.events.map(e => e.event)).toEqual(['start', 'error']);
        expect(calls[0].body.events[1].data).toEqual({ error: 'network' });
        remoteLog('speech', 'end');
        await vi.advanceTimersByTimeAsync(REMOTE_LOG_DELAY_MS + 1);
        expect(calls).toHaveLength(2);
        expect(calls[1].body.ua).toBeUndefined();
    });

    it('never throws: unserialisable data, a dead server, no fetch at all', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });
        const loop = {};
        loop.self = loop;
        remoteLog('mic', 'weird', loop);
        expect(await flushRemoteLog()).toBe(false);
        globalThis.fetch = undefined;
        remoteLog('mic', 'x');
        expect(await flushRemoteLog()).toBe(false);
        expect(await flushRemoteLog()).toBe(false);
    });
});
