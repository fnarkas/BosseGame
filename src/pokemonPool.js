// Which Pokemon are in the game right now.
//
// src/pokemonData.js holds every Pokemon (all generations). The game only uses
// the first `maxPokemonId` of them: that is how many the child can catch and
// how many the Pokedex shows. The limit comes from the `pokedex` section of
// the minigame config, so a parent can raise it per account from /admin as
// the child grows out of the 151 Kanto Pokemon. applyPokedexConfig() is
// awaited once at boot (BootScene) and again when the admin panel opens an
// account, so every synchronous reader below sees the right pool. The game
// itself raises the limit when the pool is completed (src/pokedexUnlock.js).

import { POKEMON_DATA } from './pokemonData.js';
import { loadModeConfig } from './minigameConfig.js';

export const DEFAULT_MAX_POKEMON_ID = 151;
export const TOTAL_POKEMON = POKEMON_DATA.length ? POKEMON_DATA[POKEMON_DATA.length - 1].id : 0;

// Last national dex number of each generation, for the admin presets.
export const GENERATIONS = [
    { gen: 1, lastId: 151, region: 'Kanto' },
    { gen: 2, lastId: 251, region: 'Johto' },
    { gen: 3, lastId: 386, region: 'Hoenn' },
    { gen: 4, lastId: 493, region: 'Sinnoh' },
    { gen: 5, lastId: 649, region: 'Unova' },
    { gen: 6, lastId: 721, region: 'Kalos' },
    { gen: 7, lastId: 809, region: 'Alola' },
    { gen: 8, lastId: 905, region: 'Galar' },
    { gen: 9, lastId: 1025, region: 'Paldea' }
].filter(g => g.lastId <= TOTAL_POKEMON);

export const POKEDEX_CONFIG_DEFAULTS = { maxPokemonId: DEFAULT_MAX_POKEMON_ID };

let maxPokemonId = DEFAULT_MAX_POKEMON_ID;
let cachedPool = null;

// Clamp any input (number, numeric string, garbage) to a valid dex number.
export function clampMaxPokemonId(value) {
    const n = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(n)) return DEFAULT_MAX_POKEMON_ID;
    return Math.min(TOTAL_POKEMON, Math.max(1, Math.round(n)));
}

export function getMaxPokemonId() {
    return maxPokemonId;
}

export function setMaxPokemonId(value) {
    const next = clampMaxPokemonId(value);
    if (next !== maxPokemonId) cachedPool = null;
    maxPokemonId = next;
    return maxPokemonId;
}

// The Pokemon the child can meet and see, in dex order.
export function getAvailablePokemon() {
    if (!cachedPool) cachedPool = POKEMON_DATA.filter(pokemon => pokemon.id <= maxPokemonId);
    return cachedPool;
}

export function isPokemonAvailable(id) {
    return Number.isInteger(id) && id >= 1 && id <= maxPokemonId;
}

export function getPokemonById(id) {
    return POKEMON_DATA.find(pokemon => pokemon.id === id) || null;
}

// Read the account's limit from the config and apply it. Resolves with the
// section so callers can show it.
export async function applyPokedexConfig() {
    const config = await loadModeConfig('pokedex', POKEDEX_CONFIG_DEFAULTS);
    config.maxPokemonId = setMaxPokemonId(config.maxPokemonId);
    return config;
}

// Tests and the admin panel reset to the built-in default.
export function resetPokemonPool() {
    setMaxPokemonId(DEFAULT_MAX_POKEMON_ID);
}
