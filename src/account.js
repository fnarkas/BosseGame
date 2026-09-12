// Player accounts: login by name and keep the in-memory state (storage.js)
// synced to the server (server/api.js, SQLite).
//
// Writes are batched: every change is queued and posted a few hundred ms
// later as one request. A failed post keeps the changes queued and retries,
// so a flaky Wi-Fi moment loses nothing. When the page is hidden or closed the
// queue is sent with sendBeacon, which the browser delivers even after the
// tab is gone.
//
// Reads go the other way too (live sync): while the game runs it asks the
// server every few seconds, and whenever the tab becomes visible, whether the
// account has a newer revision than the one it holds. If so the whole state
// is fetched and every key that differs (and is not waiting to be sent from
// here) is applied silently. That is how a change a parent makes in /admin on
// another device (probabilities, the next Pokemon, coins) reaches a game that
// is already open: each view re-reads the state at its natural entry point,
// e.g. the wheel before a spin and the catching scene before an encounter.
// Views that want to redraw right away subscribe with onRemoteChange().

import { loadState, applyRemoteState, onStorageChange, getString, setString, remove } from './storage.js';
import { invalidateMinigameConfig, CONFIG_OVERRIDE_KEY } from './minigameConfig.js';

export const ACCOUNT_NAME_KEY = 'accountName';
export const FLUSH_DELAY_MS = 300;
export const RETRY_DELAY_MS = 3000;
export const LIVE_SYNC_INTERVAL_MS = 10000;
export const PULL_THROTTLE_MS = 2000;
export const PULL_TIMEOUT_MS = 2500;

let currentName = null;
let revision = 0;             // server revision this device last saw in full
let pending = new Map();      // key -> value | null, not yet sent
let inflightKeys = new Set(); // keys in the batch currently being posted
let flushTimer = null;
let inflight = null;          // promise of the batch currently being posted
let pullInflight = null;      // promise of the pull currently running
let lastPullAt = 0;
let liveSyncTimer = null;
let liveSyncBound = false;
let unsubscribe = null;
let lifecycleBound = false;
const syncListeners = new Set();
const remoteListeners = new Set();
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

// The server revision of the state this device holds (tests and debugging).
export function getRevision() {
    return revision;
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
    revision = Number.isFinite(payload.revision) ? payload.revision : 0;
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
    stopLiveSync();
    currentName = null;
    revision = 0;
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
    revision = 0;
    loadState({});
    invalidateMinigameConfig();
}

// ---- change queue ----------------------------------------------------------

function queueChange(key, value, meta) {
    if (!currentName || (meta && meta.remote)) return;
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
    inflightKeys = new Set(batch.keys());
    setSyncStatus('saving');
    try {
        const reply = await parseResponse(await api('state', { name, changes: Object.fromEntries(batch) }));
        // Our batch went straight on top of the revision we already hold, so
        // nothing else was written in between and there is nothing to pull.
        if (currentName === name && reply && reply.revisionBefore === revision && Number.isFinite(reply.revision)) {
            revision = reply.revision;
        }
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
    } finally {
        inflightKeys = new Set();
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

// ---- live sync (server -> this device) --------------------------------------

// Listeners get the list of keys a pull changed. Returns an unsubscribe.
export function onRemoteChange(listener) {
    remoteListeners.add(listener);
    return () => remoteListeners.delete(listener);
}

function notifyRemote(keys) {
    for (const listener of remoteListeners) {
        try {
            listener(keys);
        } catch (error) {
            console.warn('account: remote change listener failed', error);
        }
    }
}

function timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
    }
    return undefined;
}

// Ask the server for anything newer than the revision we hold and apply it.
// Resolves with the changed keys ([] when nothing changed, or when not logged
// in, throttled, or offline). Never rejects: a failed pull only means the
// game keeps playing with what it has until the next one.
export function pullChanges({ force = false } = {}) {
    if (!currentName) return Promise.resolve([]);
    if (pullInflight) return pullInflight;
    if (!force && Date.now() - lastPullAt < PULL_THROTTLE_MS) return Promise.resolve([]);
    pullInflight = doPull().finally(() => { pullInflight = null; });
    return pullInflight;
}

async function doPull() {
    const name = currentName;
    lastPullAt = Date.now();
    try {
        const query = `name=${encodeURIComponent(name)}&since=${revision}`;
        const response = await fetch(`/api/state?${query}`, { cache: 'no-store', signal: timeoutSignal(PULL_TIMEOUT_MS) });
        const reply = await parseResponse(response);
        if (currentName !== name || !reply || !Number.isFinite(reply.revision)) return [];
        if (!reply.changed) {
            revision = reply.revision;
            return [];
        }
        // Whatever this device wrote but has not delivered yet wins over the
        // server's copy; it will be posted on top shortly.
        const skip = new Set([...pending.keys(), ...inflightKeys]);
        const changed = applyRemoteState(reply.state || {}, skip);
        revision = reply.revision;
        if (changed.includes(CONFIG_OVERRIDE_KEY)) invalidateMinigameConfig();
        if (changed.length > 0) {
            console.log(`account: applied ${changed.length} remote change(s): ${changed.join(', ')}`);
            notifyRemote(changed);
        }
        return changed;
    } catch (error) {
        console.warn('account: could not check for remote changes', error);
        return [];
    }
}

// Poll while the page is visible, and right away when it becomes visible
// again (the iPad coming back from the parent's lap). Idempotent.
export function startLiveSync({ intervalMs = LIVE_SYNC_INTERVAL_MS } = {}) {
    stopLiveSync();
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    liveSyncTimer = setInterval(() => {
        if (visible()) pullChanges();
    }, intervalMs);
    if (!liveSyncBound && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        liveSyncBound = true;
        document.addEventListener('visibilitychange', () => {
            if (liveSyncTimer !== null && document.visibilityState === 'visible') pullChanges({ force: true });
        });
    }
    pullChanges({ force: true });
}

export function stopLiveSync() {
    if (liveSyncTimer !== null) clearInterval(liveSyncTimer);
    liveSyncTimer = null;
}

export function isLiveSyncRunning() {
    return liveSyncTimer !== null;
}

// Tests only: drop all state without talking to the server.
export function _resetForTests() {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushTimer = null;
    stopLiveSync();
    liveSyncBound = false;
    pending = new Map();
    inflightKeys = new Set();
    inflight = null;
    pullInflight = null;
    lastPullAt = 0;
    revision = 0;
    currentName = null;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    lifecycleBound = false;
    syncListeners.clear();
    remoteListeners.clear();
    syncStatus = 'saved';
}
