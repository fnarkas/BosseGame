// Read and write public/config/minigames.json from the admin panel.
//
// Reading goes through the game's memoised loader. Writing posts the whole
// file to /api/config/save, a middleware that exists only in the Vite dev
// server (see vite.config.js), so a production build can show the panel but
// cannot save. Each save is one read-modify-write: fetch the current file,
// merge the patch over it, post the result. Saves are queued so two clicks in
// quick succession cannot clobber each other's sections.

import { loadMinigameConfig, invalidateMinigameConfig } from '../minigameConfig.js';

export const CONFIG_URL = '/config/minigames.json';
export const SAVE_URL = '/api/config/save';
export const SAVE_UNAVAILABLE_MESSAGE =
    'Saving is only available from the Vite dev server (npm run dev). ' +
    'This is a production build, so the settings below are read-only; edit public/config/minigames.json instead.';

let cached = null;
let queue = Promise.resolve();
let availabilityOverride = null;

// The save endpoint is a dev-server middleware; a built bundle has no server
// behind it. Tests can force either answer with setConfigSaveAvailable().
export function isConfigSaveAvailable() {
    if (availabilityOverride !== null) return availabilityOverride;
    try {
        return !!import.meta.env.DEV;
    } catch (error) {
        return false;
    }
}

export function setConfigSaveAvailable(value) {
    availabilityOverride = value === null || value === undefined ? null : !!value;
}

// The config as last loaded or saved. Cached for the life of the page.
export async function getConfig() {
    if (!cached) cached = await loadMinigameConfig();
    return cached;
}

// Forget the cached copy (tests, or after an external change).
export function resetConfigCache() {
    cached = null;
}

// Fresh copy from the server, so a save never overwrites what another device
// or tab wrote since this page was opened. Falls back to the cached copy.
async function readCurrentConfig() {
    try {
        const response = await fetch(CONFIG_URL, { cache: 'no-store' });
        if (response.ok) {
            const config = await response.json();
            if (config && typeof config === 'object') return config;
        }
    } catch (error) {
        console.warn('Admin: could not re-read config before saving, using cached copy', error);
    }
    return getConfig();
}

// Merge `patch` (top-level sections, e.g. { addition: {...} }) over the
// current file and post it. Resolves with the saved config. Rejects when
// saving is unavailable or the server refuses.
export function saveConfig(patch) {
    const run = queue.then(() => performSave(patch));
    // Keep the chain alive after a failure so later saves still run.
    queue = run.catch(() => {});
    return run;
}

async function performSave(patch) {
    if (!isConfigSaveAvailable()) {
        throw new Error(SAVE_UNAVAILABLE_MESSAGE);
    }
    if (!patch || typeof patch !== 'object') {
        throw new Error('saveConfig expects an object of config sections');
    }
    const current = await readCurrentConfig();
    const next = { ...current, ...patch };
    const response = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
    });
    if (!response || !response.ok) {
        throw new Error(`Server returned ${response ? response.status : 'no response'}`);
    }
    cached = next;
    // The game caches the file too; make its next load see the new values.
    invalidateMinigameConfig();
    return next;
}
