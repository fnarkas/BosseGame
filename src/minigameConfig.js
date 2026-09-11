// One cached fetch of public/config/minigames.json for the whole game.
//
// Previously every game mode, the wheel, the letter data and the emoji
// dictionary each fetched the file on their own (16+ requests at startup, some
// of them served stale from the HTTP cache after an admin save). Now there is a
// single memoised promise: the first caller triggers the request, everyone else
// awaits the same result. A hung request is abandoned after a few seconds so
// the game can never sit on the loading screen forever; a failed or missing
// file yields `{}` so every caller falls back to its own defaults.

const CONFIG_URL = '/config/minigames.json';
const TIMEOUT_MS = 4000;

let configPromise = null;

function timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
    }
    return undefined;
}

export function loadMinigameConfig() {
    if (!configPromise) {
        configPromise = (async () => {
            try {
                const response = await fetch(CONFIG_URL, { cache: 'no-store', signal: timeoutSignal(TIMEOUT_MS) });
                if (!response.ok) {
                    console.warn(`Minigame config: HTTP ${response.status}, using defaults`);
                    return {};
                }
                const config = await response.json();
                return (config && typeof config === 'object') ? config : {};
            } catch (error) {
                console.warn('Minigame config: failed to load, using defaults:', error);
                return {};
            }
        })();
    }
    return configPromise;
}

// `defaults` merged with the named section of the config. Only keys present in
// `defaults` are taken from the config, so a typo in the file can't inject
// unexpected fields, and values are coerced to the default's type.
export async function loadModeConfig(sectionKey, defaults = {}) {
    const config = await loadMinigameConfig();
    const section = config[sectionKey];
    const result = { ...defaults };
    if (!section || typeof section !== 'object') return result;
    for (const key of Object.keys(defaults)) {
        if (!(key in section) || section[key] === null || section[key] === undefined) continue;
        result[key] = coerceLike(defaults[key], section[key]);
    }
    return result;
}

function coerceLike(defaultValue, value) {
    if (typeof defaultValue === 'number') {
        const n = typeof value === 'number' ? value : parseFloat(value);
        return Number.isFinite(n) ? n : defaultValue;
    }
    if (typeof defaultValue === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return defaultValue;
    }
    if (typeof defaultValue === 'string') {
        return String(value);
    }
    return value;
}

// Forget the cached config so the next caller re-fetches it (the admin panel
// calls this after saving; tests call it between cases).
export function invalidateMinigameConfig() {
    configPromise = null;
}
