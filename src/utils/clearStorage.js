// Wipe every saved value on this device: the in-memory account state, the
// remembered account name and the device settings. Used by the /reset page
// (main.js clears the account on the server first). Never throws: a browser
// with storage disabled (Safari private mode) simply has nothing to clear.
import { resetStorage } from '../storage.js';

export function clearAllStorage() {
    try {
        resetStorage();
        return true;
    } catch (error) {
        console.warn('storage: failed to clear', error);
        return false;
    }
}
