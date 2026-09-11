// Safe localStorage access.
//
// Every read and write in the game goes through here so that a corrupt value,
// a full quota, or a browser with storage disabled (Safari private mode,
// embedded webviews) can never throw in the middle of an animation and freeze
// the game for a child who can't read the console. On failure we log once and
// fall back to the caller's default; the game keeps running with in-memory
// state for the session.

const memoryFallback = new Map();

function storage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

export function getString(key, fallback = null) {
    const store = storage();
    if (!store) return memoryFallback.has(key) ? memoryFallback.get(key) : fallback;
    try {
        const value = store.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        console.warn(`storage: failed to read '${key}'`, error);
        return fallback;
    }
}

export function setString(key, value) {
    const store = storage();
    memoryFallback.set(key, value);
    if (!store) return false;
    try {
        store.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`storage: failed to write '${key}'`, error);
        return false;
    }
}

export function remove(key) {
    memoryFallback.delete(key);
    const store = storage();
    if (!store) return;
    try {
        store.removeItem(key);
    } catch (error) {
        console.warn(`storage: failed to remove '${key}'`, error);
    }
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
