// Tracks the minigame the player is currently in, so a page reload resumes the
// same game instead of rolling a new one. Without this, reloading re-runs the
// random mode selection and lets a child "shop" for a game by reloading until
// the wheel shows the one they want.
//
// The stored value is the game-mode class name (e.g. "AdditionMode"). It is set
// when a mode is chosen in normal (non-forced) play and cleared when that game
// is completed or declined at the wheel.

const ACTIVE_MINIGAME_KEY = 'activeMinigameMode';

export function saveActiveMinigame(modeName) {
    try {
        localStorage.setItem(ACTIVE_MINIGAME_KEY, modeName);
    } catch (error) {
        console.warn('Failed to save active minigame:', error);
    }
}

export function loadActiveMinigame() {
    try {
        return localStorage.getItem(ACTIVE_MINIGAME_KEY);
    } catch (error) {
        console.warn('Failed to load active minigame:', error);
        return null;
    }
}

export function clearActiveMinigame() {
    try {
        localStorage.removeItem(ACTIVE_MINIGAME_KEY);
    } catch (error) {
        console.warn('Failed to clear active minigame:', error);
    }
}
