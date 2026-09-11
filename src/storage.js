// Saved-state access for the game.
//
// Every read and write in the game goes through here. The player's progress
// (coins, streak, caught Pokemon, mistakes, ...) lives in an in-memory map that
// account.js fills from the server at login and syncs back on every change, so
// the same child can play on any device in the house. Reads are synchronous,
// which is what the game modes expect.
//
// A few values belong to the device rather than the player (the iPad's
// volume, which account was last used) and stay in localStorage. That access is
// wrapped so a browser with storage disabled (Safari private mode, embedded
// webviews) can never throw in the middle of an animation and freeze the game
// for a child who can't read the console.

export const DEVICE_KEYS = new Set(['gameVolume', 'accountName']);

const cache = new Map();
const listeners = new Set();
const deviceFallback = new Map();

// ---- account state (in memory, synced by account.js) ----------------------

// Replace the whole in-memory state, e.g. right after login.
export function loadState(values) {
    cache.clear();
    for (const [key, value] of Object.entries(values || {})) {
        if (typeof value === 'string' && !DEVICE_KEYS.has(key)) cache.set(key, value);
    }
}

export function getAllValues() {
    return Object.fromEntries(cache);
}

// Called with (key, value) on every write and (key, null) on every removal of
// account state. Returns an unsubscribe function.
export function onStorageChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify(key, value) {
    for (const listener of listeners) {
        try {
            listener(key, value);
        } catch (error) {
            console.warn('storage: change listener failed', error);
        }
    }
}

// Forget everything: account state, device settings and listeners' pending
// work is the caller's business. Used by /reset and the tests.
export function resetStorage() {
    cache.clear();
    deviceFallback.clear();
    const store = localStorageOrNull();
    if (!store) return;
    try {
        store.clear();
    } catch (error) {
        console.warn('storage: failed to clear', error);
    }
}

// ---- device-local values (localStorage) ------------------------------------

function localStorageOrNull() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

function getDevice(key, fallback) {
    const store = localStorageOrNull();
    if (!store) return deviceFallback.has(key) ? deviceFallback.get(key) : fallback;
    try {
        const value = store.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        console.warn(`storage: failed to read '${key}'`, error);
        return fallback;
    }
}

function setDevice(key, value) {
    deviceFallback.set(key, value);
    const store = localStorageOrNull();
    if (!store) return false;
    try {
        store.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`storage: failed to write '${key}'`, error);
        return false;
    }
}

function removeDevice(key) {
    deviceFallback.delete(key);
    const store = localStorageOrNull();
    if (!store) return;
    try {
        store.removeItem(key);
    } catch (error) {
        console.warn(`storage: failed to remove '${key}'`, error);
    }
}

// Progress saved by older versions of the game straight into localStorage.
// The login screen offers to move it to an account (account.js).
export function readLegacyLocalData() {
    const store = localStorageOrNull();
    const data = {};
    if (!store) return data;
    try {
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key === null || DEVICE_KEYS.has(key)) continue;
            const value = store.getItem(key);
            if (typeof value === 'string') data[key] = value;
        }
    } catch (error) {
        console.warn('storage: failed to read legacy data', error);
    }
    return data;
}

export function clearLegacyLocalData() {
    for (const key of Object.keys(readLegacyLocalData())) removeDevice(key);
}

// ---- public API used by the game ------------------------------------------

export function getString(key, fallback = null) {
    if (DEVICE_KEYS.has(key)) return getDevice(key, fallback);
    return cache.has(key) ? cache.get(key) : fallback;
}

export function setString(key, value) {
    const str = String(value);
    if (DEVICE_KEYS.has(key)) return setDevice(key, str);
    cache.set(key, str);
    notify(key, str);
    return true;
}

export function remove(key) {
    if (DEVICE_KEYS.has(key)) {
        removeDevice(key);
        return;
    }
    if (!cache.delete(key)) return;
    notify(key, null);
}

export function has(key) {
    return getString(key) !== null;
}

// JSON value; a missing or unparseable value yields `fallback`. When
// `validate` is given, values it rejects are treated as corrupt and replaced
// by the fallback too (e.g. `Array.isArray`).
export function getJSON(key, fallback, validate = null) {
    const raw = getString(key);
    if (raw === null) return fallback;
    try {
        const value = JSON.parse(raw);
        if (validate && !validate(value)) {
            console.warn(`storage: '${key}' has an unexpected shape, using default`);
            return fallback;
        }
        return value;
    } catch (error) {
        console.warn(`storage: '${key}' is not valid JSON, using default`, error);
        return fallback;
    }
}

export function setJSON(key, value) {
    return setString(key, JSON.stringify(value));
}

// Integer value; NaN, negative garbage or a missing value yields `fallback`.
export function getInt(key, fallback = 0) {
    const raw = getString(key);
    if (raw === null) return fallback;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
}

export function setInt(key, value) {
    return setString(key, String(Math.trunc(value)));
}

export function getFloat(key, fallback = 0) {
    const raw = getString(key);
    if (raw === null) return fallback;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
}

export function setFloat(key, value) {
    return setString(key, String(value));
}

export function getBool(key, fallback = false) {
    const raw = getString(key);
    if (raw === null) return fallback;
    return raw === 'true';
}

export function setBool(key, value) {
    return setString(key, value ? 'true' : 'false');
}
