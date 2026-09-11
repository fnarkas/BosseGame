// Player accounts: login by name and keep the in-memory state (storage.js)
// synced to the server (server/api.js, SQLite).
//
// Writes are batched: every change is queued and posted a few hundred ms
// later as one request. A failed post keeps the changes queued and retries,
// so a flaky Wi-Fi moment loses nothing. When the page is hidden or closed the
// queue is sent with sendBeacon, which the browser delivers even after the
// tab is gone.

import { loadState, onStorageChange, getString, setString, remove } from './storage.js';
import { invalidateMinigameConfig } from './minigameConfig.js';

export const ACCOUNT_NAME_KEY = 'accountName';
export const FLUSH_DELAY_MS = 300;
export const RETRY_DELAY_MS = 3000;

let currentName = null;
let pending = new Map();      // key -> value | null, not yet sent
let flushTimer = null;
let inflight = null;          // promise of the batch currently being posted
let unsubscribe = null;
let lifecycleBound = false;
const syncListeners = new Set();
let syncStatus = 'saved';       // 'saved' | 'pending' | 'saving' | 'error'

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

// ---- sync status (for the admin panel's "all changes saved" indicator) ------

// 'saved' when nothing is queued, 'pending' while a batch waits for its
// timer, 'saving' while it is being posted, 'error' after a failed post (a
// retry is scheduled). Listeners get the new status; the current one is
// returned by getSyncStatus().
export function getSyncStatus() {
    return syncStatus;
}

export function onSyncChange(listener) {
    syncListeners.add(listener);
    return () => syncListeners.delete(listener);
}

function setSyncStatus(status) {
    if (status === syncStatus) return;
    syncStatus = status;
    for (const listener of syncListeners) {
        try {
            listener(status);
        } catch (error) {
            console.warn('account: sync listener failed', error);
        }
    }
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
// saved state into storage.js and starts syncing changes back. With
// `remember: false` (the admin panel) the device keeps its own player.
export async function login(name, { remember = true } = {}) {
    const payload = await parseResponse(await api('login', { name }));
    activate(payload, remember);
    return { name: payload.name, created: !!payload.created };
}

function activate(payload, remember) {
    flushNow();
    pending = new Map();
    currentName = payload.name;
    if (remember) setString(ACCOUNT_NAME_KEY, payload.name);
    loadState(payload.state || {});
    invalidateMinigameConfig();
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
    invalidateMinigameConfig();
}

// Wipe an account's progress on the server and locally.
export async function resetAccount(name = getCurrentAccount()) {
    if (name) await parseResponse(await api('reset', { name }));
    pending = new Map();
    loadState({});
    invalidateMinigameConfig();
}

// ---- change queue ----------------------------------------------------------

function queueChange(key, value) {
    if (!currentName) return;
    pending.set(key, value);
    setSyncStatus('pending');
    scheduleFlush(FLUSH_DELAY_MS);
}

function scheduleFlush(delayMs) {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, delayMs);
}

export function hasPendingChanges() {
    return pending.size > 0;
}

// Post one batch. On failure the batch goes back under anything written since
// and a retry is scheduled. Resolves true when the server confirmed it.
async function sendBatch() {
    const name = currentName;
    const batch = pending;
    pending = new Map();
    setSyncStatus('saving');
    try {
        await parseResponse(await api('state', { name, changes: Object.fromEntries(batch) }));
        setSyncStatus(pending.size > 0 ? 'pending' : 'saved');
        return true;
    } catch (error) {
        console.warn('account: failed to save, will retry', error);
        if (currentName === name) {
            for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
            scheduleFlush(RETRY_DELAY_MS);
            setSyncStatus('error');
        } else {
            setSyncStatus('saved');
        }
        return false;
    }
}

// Post everything queued. Resolves true once the server has confirmed every
// change, false when a post failed and a retry has been scheduled. Never
// rejects.
export async function flush() {
    while (currentName && pending.size > 0) {
        if (inflight) {
            await inflight;
            continue;
        }
        if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        inflight = sendBatch().finally(() => { inflight = null; });
        if (!(await inflight)) return false;
    }
    return true;
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
    setSyncStatus('saved');
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
    inflight = null;
    currentName = null;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    lifecycleBound = false;
    syncListeners.clear();
    syncStatus = 'saved';
}
