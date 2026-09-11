// The minigame wheel, derived from the registry in minigameRegistry.js.
//
// Each slice on the spin wheel maps to one or more game-mode classes and to
// one or more weight keys in public/config/minigames.json. Modes that declare
// the same `slice` name in the registry (e.g. number listening / reading)
// share one slice. A slice only appears on the wheel when the combined weight
// of its keys is greater than 0, so a mode set to probability 0 disappears
// from the wheel entirely.

import { MINIGAMES } from './minigameRegistry.js';
import { loadMinigameConfig } from './minigameConfig.js';

function buildWheelSlices() {
    const slices = [];
    const byName = new Map();
    for (const game of MINIGAMES) {
        const sliceName = game.slice || game.key;
        let slice = byName.get(sliceName);
        if (!slice) {
            slice = { name: sliceName, classNames: [], iconKey: game.icon, color: game.color, weightKeys: [] };
            byName.set(sliceName, slice);
            slices.push(slice);
        }
        slice.classNames.push(game.Mode.name);
        slice.weightKeys.push(game.key);
    }
    return slices;
}

// Slices in draw order (slice 0 at the top, proceeding clockwise).
export const WHEEL_SLICES = buildWheelSlices();

// Default weight for every mode key. Config values in minigames.json are merged
// over these, so any key omitted from the config keeps its default here.
export const DEFAULT_MODE_WEIGHTS = Object.fromEntries(
    MINIGAMES.map(game => [game.key, game.defaultWeight])
);

// Fetch the configured weights, merged over the defaults. Never throws.
export async function loadModeWeights() {
    const config = await loadMinigameConfig();
    const weights = { ...DEFAULT_MODE_WEIGHTS };
    if (config.weights && typeof config.weights === 'object') {
        for (const key of Object.keys(DEFAULT_MODE_WEIGHTS)) {
            const value = parseInt(config.weights[key], 10);
            if (Number.isFinite(value) && value >= 0) weights[key] = value;
        }
    }
    return weights;
}

// Combined weight of a slice (sum of its weight keys).
export function sliceWeight(slice, weights) {
    return slice.weightKeys.reduce((sum, key) => sum + (weights[key] || 0), 0);
}

// The slices to show on the wheel: those with a combined weight > 0, in draw
// order. Falls back to every slice if the config would leave the wheel empty
// (all weights 0) so the wheel is never blank.
export function getEnabledSlices(weights) {
    const enabled = WHEEL_SLICES.filter(slice => sliceWeight(slice, weights) > 0);
    return enabled.length > 0 ? enabled : WHEEL_SLICES;
}
