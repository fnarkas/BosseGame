// Remote diagnostics: ship events from the child's device to the server
// (POST /api/log), because the iPad has no console we can read from here.
//
// Three kinds of events end up here:
//   * the game's own milestones (remoteLog('game', ...) in the scenes: which
//     mode was rolled, the wheel, answers, rewards, encounters, catches),
//   * the speech recognition path (remoteLog('speech' | 'mic', ...)),
//   * everything the browser would have shown in a console we cannot see:
//     console.error / console.warn, uncaught exceptions and unhandled promise
//     rejections (installRemoteLogging()).
//
// Events are batched and posted a moment later; nothing here can throw or slow
// the game down, and a server that does not answer just loses them. The admin
// panel reads them back with fetchClientLog() (the Logs tab).

import { getCurrentAccount } from './account.js';

export const REMOTE_LOG_DELAY_MS = 1500;
const MAX_QUEUE = 200;
const MAX_TEXT = 600;
// Console capture is rate limited so a warning in a render loop cannot flood
// the server: after this many per level within a minute, one "muted" marker.
const CONSOLE_BURST_LIMIT = 40;
const CONSOLE_BURST_WINDOW_MS = 60 * 1000;

let queue = [];
let timer = null;
let sentUserAgent = false;
let uninstall = null;

function safeData(data) {
    try {
        return JSON.parse(JSON.stringify(data === undefined ? null : data));
    } catch (error) {
        return String(data);
    }
}

function currentPath() {
    return typeof location !== 'undefined' && location && location.pathname ? location.pathname : null;
}

export function remoteLog(source, event, data = null) {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ t: Date.now(), source, event, data: safeData(data) });
    if (timer === null) timer = setTimeout(flushRemoteLog, REMOTE_LOG_DELAY_MS);
}

export function flushRemoteLog() {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }
    if (queue.length === 0 || typeof fetch !== 'function') return Promise.resolve(false);
    const events = queue;
    queue = [];
    const body = {
        name: getCurrentAccount(),
        ua: sentUserAgent ? undefined : (typeof navigator !== 'undefined' ? navigator.userAgent : 'node'),
        path: currentPath(),
        events
    };
    sentUserAgent = true;
    try {
        return fetch('/api/log', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true
        }).then(response => !!response && response.ok, () => false);
    } catch (error) {
        return Promise.resolve(false);
    }
}

// ---------------------------------------------------------------------------
// Console and error capture
// ---------------------------------------------------------------------------

// One console argument as text: errors keep their stack, objects are
// serialised, everything is capped so a huge dump cannot bloat a batch.
export function describeArgument(value) {
    let text;
    if (value instanceof Error) {
        text = value.stack || `${value.name}: ${value.message}`;
    } else if (typeof value === 'string') {
        text = value;
    } else {
        try {
            text = JSON.stringify(value);
        } catch (error) {
            text = String(value);
        }
        if (text === undefined) text = String(value);
    }
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '…' : text;
}

function describeError(error) {
    if (!error) return null;
    if (error instanceof Error) return { message: error.message, stack: describeArgument(error) };
    return { message: describeArgument(error) };
}

// Hook console.error/warn, window 'error' and 'unhandledrejection', and flush
// the queue when the page is hidden or closed. Idempotent; returns a function
// that undoes it. `win` and `con` are injectable for tests.
export function installRemoteLogging(win = typeof window !== 'undefined' ? window : null, con = console) {
    if (uninstall) return uninstall;
    const originals = { error: con.error, warn: con.warn };
    const counts = { error: [], warn: [] };
    const muted = { error: false, warn: false };

    const capture = (level) => (...args) => {
        try {
            originals[level].apply(con, args);
        } catch (error) {
            // The original console is not our problem.
        }
        try {
            const now = Date.now();
            const recent = counts[level].filter(t => now - t < CONSOLE_BURST_WINDOW_MS);
            counts[level] = recent;
            if (recent.length >= CONSOLE_BURST_LIMIT) {
                if (!muted[level]) {
                    muted[level] = true;
                    remoteLog('console', 'muted', { level, limit: CONSOLE_BURST_LIMIT });
                }
                return;
            }
            muted[level] = false;
            recent.push(now);
            remoteLog('console', level, { message: args.map(describeArgument).join(' ') });
        } catch (error) {
            // Never let logging break the caller.
        }
    };
    con.error = capture('error');
    con.warn = capture('warn');

    const onError = (event) => {
        remoteLog('window', 'error', {
            message: event && event.message ? describeArgument(event.message) : null,
            source: event && event.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : null,
            error: describeError(event && event.error)
        });
    };
    const onRejection = (event) => {
        remoteLog('window', 'unhandledrejection', { reason: describeError(event && event.reason) });
    };
    const onHide = () => {
        if (typeof document === 'undefined' || document.visibilityState !== 'visible') flushRemoteLog();
    };
    if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('error', onError);
        win.addEventListener('unhandledrejection', onRejection);
        win.addEventListener('pagehide', onHide);
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', onHide);
        }
    }

    uninstall = () => {
        con.error = originals.error;
        con.warn = originals.warn;
        if (win && typeof win.removeEventListener === 'function') {
            win.removeEventListener('error', onError);
            win.removeEventListener('unhandledrejection', onRejection);
            win.removeEventListener('pagehide', onHide);
            if (typeof document !== 'undefined' && document.removeEventListener) {
                document.removeEventListener('visibilitychange', onHide);
            }
        }
        uninstall = null;
    };
    return uninstall;
}

// ---------------------------------------------------------------------------
// Reading back (admin Logs tab)
// ---------------------------------------------------------------------------

// The newest `n` entries for `name` (every account when null), oldest first.
export async function fetchClientLog({ name = null, n = 300 } = {}) {
    const params = new URLSearchParams();
    params.set('n', String(n));
    if (name) params.set('name', name);
    const response = await fetch(`/api/log?${params}`, { cache: 'no-store' });
    if (!response || !response.ok) throw new Error(`Server returned ${response ? response.status : 'nothing'}`);
    const entries = await response.json();
    return Array.isArray(entries) ? entries : [];
}

export function _resetRemoteLogForTests() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    queue = [];
    sentUserAgent = false;
    if (uninstall) uninstall();
}
