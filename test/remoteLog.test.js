import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    remoteLog, flushRemoteLog, installRemoteLogging, describeArgument, fetchClientLog,
    REMOTE_LOG_DELAY_MS, _resetRemoteLogForTests
} from '../src/remoteLog.js';

// A window stand-in that records listeners so the test can fire events.
function fakeWindow() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        fire(type, event) { const fn = listeners.get(type); if (fn) fn(event); }
    };
}

describe('remoteLog', () => {
    let originalFetch;
    let calls;
    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.useFakeTimers();
        _resetRemoteLogForTests();
        calls = [];
        globalThis.fetch = vi.fn(async (url, options) => {
            calls.push({ url, body: options && options.body ? JSON.parse(options.body) : null });
            return { ok: true, status: 200, json: async () => [] };
        });
    });
    afterEach(() => {
        _resetRemoteLogForTests();
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
    });

    it('batches events and posts them once, with the user agent only the first time', async () => {
        remoteLog('speech', 'start');
        remoteLog('speech', 'error', { error: 'network' });
        expect(calls).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(REMOTE_LOG_DELAY_MS + 1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('/api/log');
        expect(calls[0].body.ua).toBeTruthy();
        expect(calls[0].body.path).toBe('/');
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

    describe('installRemoteLogging', () => {
        it('captures console errors and warnings, still printing them, and uncaught errors', async () => {
            const win = fakeWindow();
            const printed = [];
            const con = { error: (...a) => printed.push(['error', ...a]), warn: (...a) => printed.push(['warn', ...a]) };
            const uninstall = installRemoteLogging(win, con);

            con.error('Boom', { id: 5 });
            con.warn('Careful', new Error('why'));
            win.fire('error', { message: 'x is not defined', filename: 'app.js', lineno: 12, colno: 3, error: new Error('x is not defined') });
            win.fire('unhandledrejection', { reason: new Error('nope') });

            expect(printed.map(p => p[0])).toEqual(['error', 'warn']);
            await vi.advanceTimersByTimeAsync(REMOTE_LOG_DELAY_MS + 1);
            const events = calls[0].body.events;
            expect(events.map(e => `${e.source}:${e.event}`)).toEqual([
                'console:error', 'console:warn', 'window:error', 'window:unhandledrejection'
            ]);
            expect(events[0].data.message).toBe('Boom {"id":5}');
            expect(events[1].data.message).toContain('Careful Error: why');
            expect(events[2].data).toMatchObject({ message: 'x is not defined', source: 'app.js:12:3' });
            expect(events[2].data.error.stack).toContain('x is not defined');
            expect(events[3].data.reason.message).toBe('nope');

            uninstall();
            con.error('after');
            expect(printed.at(-1)).toEqual(['error', 'after']);
            await vi.advanceTimersByTimeAsync(REMOTE_LOG_DELAY_MS + 1);
            expect(calls).toHaveLength(1);
        });

        it('mutes a flood of warnings after the burst limit and installs only once', async () => {
            const win = fakeWindow();
            const con = { error: () => {}, warn: () => {} };
            const first = installRemoteLogging(win, con);
            expect(installRemoteLogging(win, con)).toBe(first);
            for (let i = 0; i < 60; i++) con.warn(`w${i}`);
            await vi.advanceTimersByTimeAsync(REMOTE_LOG_DELAY_MS + 1);
            const events = calls.flatMap(c => c.body.events);
            const warns = events.filter(e => e.event === 'warn');
            expect(warns).toHaveLength(40);
            expect(events.filter(e => e.event === 'muted')).toHaveLength(1);
            // The queue itself is capped, so a flood cannot grow without bound
            expect(events.length).toBeLessThanOrEqual(200);
        });

        it('flushes when the page is hidden', async () => {
            const win = fakeWindow();
            installRemoteLogging(win, { error: () => {}, warn: () => {} });
            remoteLog('game', 'encounter', { id: 1 });
            win.fire('pagehide', {});
            await vi.advanceTimersByTimeAsync(1);
            expect(calls).toHaveLength(1);
            expect(calls[0].body.events[0].event).toBe('encounter');
        });
    });

    it('describes arguments compactly and caps long ones', () => {
        expect(describeArgument('hi')).toBe('hi');
        expect(describeArgument({ a: 1 })).toBe('{"a":1}');
        expect(describeArgument(undefined)).toBe('undefined');
        expect(describeArgument(new Error('bad'))).toContain('bad');
        expect(describeArgument('x'.repeat(2000)).length).toBeLessThan(700);
    });

    it('reads the log back for one account', async () => {
        globalThis.fetch = vi.fn(async (url) => {
            calls.push({ url });
            return { ok: true, status: 200, json: async () => [{ source: 'game', event: 'boot' }] };
        });
        const entries = await fetchClientLog({ name: 'Bosse', n: 50 });
        expect(calls[0].url).toBe('/api/log?n=50&name=Bosse');
        expect(entries).toEqual([{ source: 'game', event: 'boot' }]);
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
        await expect(fetchClientLog()).rejects.toThrow('500');
    });
});
