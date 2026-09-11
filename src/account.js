// Player accounts: login by name and keep the in-memory state (storage.js)
// synced to the server (server/api.js, SQLite).
//
// Writes are batched: every change is queued and posted a few hundred ms
// later as one request. A failed post keeps the changes queued and retries,
// so a flaky Wi-Fi moment loses nothing. When the page is hidden or closed the
// queue is sent with sendBeacon, which the browser delivers even after the
// tab is gone.

import {
    loadState, onStorageChange, getString, setString, remove,
    readLegacyLocalData, clearLegacyLocalData
} from './storage.js';

export const ACCOUNT_NAME_KEY = 'accountName';
export const FLUSH_DELAY_MS = 300;
export const RETRY_DELAY_MS = 3000;

let currentName = null;
let pending = new Map();      // key -> value | null, not yet sent
let flushTimer = null;
let inflight = false;
let unsubscribe = null;
let lifecycleBound = false;

function api(path, body) {
    return fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function parseResponse(response) {
    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        payload = null;
    }
    if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : `Server returned ${response.status}`);
    }
    return payload;
}

// The account this device last played as, if any.
export function getCurrentAccount() {
    return currentName || getString(ACCOUNT_NAME_KEY, null);
}

export function isLoggedIn() {
    return currentName !== null;
}

export async function listAccounts() {
    const response = await fetch('/api/accounts', { cache: 'no-store' });
    const list = await parseResponse(response);
    return Array.isArray(list) ? list : [];
}

// Log in by name. An unknown name becomes a new account. Loads that account's
// saved state into storage.js and starts syncing changes back.
export async function login(name) {
    const payload = await parseResponse(await api('login', { name }));
    activate(payload);
    return { name: payload.name, created: !!payload.created };
}

// Move progress saved by an older version of the game (localStorage) into an
// account, then log in as it. The local copy is removed once the server has it.
export async function importLocalData(name) {
    const data = readLegacyLocalData();
    const payload = await parseResponse(await api('import', { name, data }));
    clearLegacyLocalData();
    activate(payload);
    return { name: payload.name, created: !!payload.created, imported: payload.imported || 0 };
}

export function hasLegacyLocalData() {
    return Object.keys(readLegacyLocalData()).length > 0;
}

function activate(payload) {
    pending = new Map();
    currentName = payload.name;
    setString(ACCOUNT_NAME_KEY, payload.name);
    loadState(payload.state || {});
    if (!unsubscribe) unsubscribe = onStorageChange(queueChange);
    bindLifecycle();
}

// Forget which account this device uses; the next load shows the login
// screen. Whatever is still queued is sent first.
export function logout() {
    flushNow();
    currentName = null;
    remove(ACCOUNT_NAME_KEY);
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    loadState({});
}

// Wipe an account's progress on the server and locally.
export async function resetAccount(name = getCurrentAccount()) {
    if (name) await parseResponse(await api('reset', { name }));
    pending = new Map();
    loadState({});
}

// ---- change queue ----------------------------------------------------------

function queueChange(key, value) {
    if (!currentName) return;
    pending.set(key, value);
    if (flushTimer === null) {
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flush();
        }, FLUSH_DELAY_MS);
    }
}

export function hasPendingChanges() {
    return pending.size > 0;
}

// Post everything queued. Resolves when the queue is empty or a retry has been
// scheduled; never rejects.
export async function flush() {
    if (inflight || pending.size === 0 || !currentName) return;
    inflight = true;
    const name = currentName;
    const batch = pending;
    pending = new Map();
    try {
        await parseResponse(await api('state', { name, changes: Object.fromEntries(batch) }));
    } catch (error) {
        console.warn('account: failed to save, will retry', error);
        // Put the batch back under anything written since, then retry later.
        if (currentName === name) {
            for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
            if (flushTimer === null) {
                flushTimer = setTimeout(() => {
                    flushTimer = null;
                    flush();
                }, RETRY_DELAY_MS);
            }
        }
    } finally {
        inflight = false;
    }
    if (pending.size > 0 && flushTimer === null) flush();
}

// Fire-and-forget delivery for pagehide: the browser keeps a beacon alive
// after the page is gone, a fetch it would cancel.
export function flushNow() {
    if (pending.size === 0 || !currentName) return;
    const body = JSON.stringify({ name: currentName, changes: Object.fromEntries(pending) });
    pending = new Map();
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon('/api/state', blob)) return;
    }
    fetch('/api/state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true
    }).catch(error => console.warn('account: final save failed', error));
}

function bindLifecycle() {
    if (lifecycleBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    lifecycleBound = true;
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushNow();
    });
}

// Tests only: drop all state without talking to the server.
export function _resetForTests() {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushTimer = null;
    pending = new Map();
    inflight = false;
    currentName = null;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    lifecycleBound = false;
}
