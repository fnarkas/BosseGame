// Wipe every saved value. Used by the /reset page. Never throws: a browser
// with storage disabled (Safari private mode) simply has nothing to clear.
export function clearAllStorage() {
    try {
        window.localStorage.clear();
        return true;
    } catch (error) {
        console.warn('storage: failed to clear', error);
        return false;
    }
}
