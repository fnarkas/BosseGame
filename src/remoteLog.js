// Remote diagnostics: ship a few events from the child's device to the server
// (POST /api/log), because the iPad has no console we can read from here.
//
// Used by the speech recognition path, whose failures only show up on a real
// iPad. Events are batched and posted a moment later; nothing here can throw
// or slow the game down, and a server that does not answer just loses them.

import { getCurrentAccount } from './account.js';

export const REMOTE_LOG_DELAY_MS = 1500;
const MAX_QUEUE = 200;

let queue = [];
let timer = null;
let sentUserAgent = false;

function safeData(data) {
    try {
        return JSON.parse(JSON.stringify(data === undefined ? null : data));
    } catch (error) {
        return String(data);
    }
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
        events
    };
    sentUserAgent = true;
    return fetch('/api/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true
    }).then(response => !!response && response.ok, () => false);
}

export function _resetRemoteLogForTests() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    queue = [];
    sentUserAgent = false;
}
