// Read and write the selected account's minigame config from the admin panel.
//
// Reading goes through the game's memoised loader (defaults file merged with
// the account's overrides). Writing merges the patch over the account's
// overrides and stores them in the account state, which account.js syncs to
// the server like every other saved value. So saving works wherever the game
// is served, and each child has their own settings. Saves are queued so two
// clicks in quick succession cannot clobber each other's sections.

import {
    loadMinigameConfig, invalidateMinigameConfig, getAccountConfigOverride, setAccountConfigOverride
} from '../minigameConfig.js';
import { flush, isLoggedIn } from '../account.js';

export const SAVE_UNAVAILABLE_MESSAGE = 'Could not reach the server; the change is queued and will be saved when it is back.';

let cached = null;
let queue = Promise.resolve();

// The merged config as last loaded or saved.
export async function getConfig() {
    if (!cached) cached = await loadMinigameConfig();
    return cached;
}

// Forget the cached copy (after switching account, or in tests).
export function resetConfigCache() {
    cached = null;
    invalidateMinigameConfig();
}

// Merge `patch` (top-level sections, e.g. { addition: {...} }) over the
// account's overrides and save. Resolves with the merged config. Rejects when
// no account is selected or the server did not confirm the save.
export function saveConfig(patch) {
    const run = queue.then(() => performSave(patch));
    // Keep the chain alive after a failure so later saves still run.
    queue = run.catch(() => {});
    return run;
}

async function performSave(patch) {
    if (!patch || typeof patch !== 'object') {
        throw new Error('saveConfig expects an object of config sections');
    }
    if (!isLoggedIn()) {
        throw new Error('No account selected');
    }
    setAccountConfigOverride({ ...getAccountConfigOverride(), ...patch });
    cached = null;
    const saved = await flush();
    if (!saved) throw new Error(SAVE_UNAVAILABLE_MESSAGE);
    return getConfig();
}
