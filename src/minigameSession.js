// Tracks the minigame the player is currently in, so a page reload resumes the
// same game instead of rolling a new one. Without this, reloading re-runs the
// random mode selection and lets a child "shop" for a game by reloading until
// the wheel shows the one they want.
//
// The stored value is the game-mode class name (e.g. "AdditionMode"). It is set
// when a mode is chosen in normal (non-forced) play and cleared when that game
// is completed or declined at the wheel.

import { getString, setString, remove } from './storage.js';

const ACTIVE_MINIGAME_KEY = 'activeMinigameMode';

export function saveActiveMinigame(modeName) {
    setString(ACTIVE_MINIGAME_KEY, modeName);
}

export function loadActiveMinigame() {
    return getString(ACTIVE_MINIGAME_KEY, null);
}

export function clearActiveMinigame() {
    remove(ACTIVE_MINIGAME_KEY);
}
