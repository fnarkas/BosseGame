// Growing the pool by playing: when every Pokemon in the pool has been
// caught, the game celebrates and raises the account's limit
// (`pokedex.maxPokemonId`, see pokemonPool.js) by a hundred, to the next
// 151 + n*100 boundary. The limit is written into the account's config
// override, the same place the admin panel saves it, so /admin shows the new
// size and the change follows the child between devices.
//
// The party only follows a catch: a pool that is already full when an
// encounter starts (admin "catch all", a save that was full before unlocking
// existed) quietly gets ONE more Pokemon, and the celebration comes when
// that one is caught. `pokedexCelebrationDue` remembers the catch that
// filled the pool until the celebration has run.

import { POKEMON_DATA } from './pokemonData.js';
import { DEFAULT_MAX_POKEMON_ID, TOTAL_POKEMON, getMaxPokemonId, setMaxPokemonId, isPokemonAvailable } from './pokemonPool.js';
import { getAccountConfigOverride, setAccountConfigOverride } from './minigameConfig.js';
import { getCaughtPokemonList, caughtIdSet } from './caughtPokemon.js';
import { getBool, setBool, remove } from './storage.js';

export const UNLOCK_BATCH_SIZE = 100;
export const CELEBRATION_DUE_KEY = 'pokedexCelebrationDue';

// How many of the Pokemon in the pool are in the caught list.
export function countCaughtAvailable(list = getCaughtPokemonList()) {
    let count = 0;
    for (const id of caughtIdSet(list)) {
        if (isPokemonAvailable(id)) count += 1;
    }
    return count;
}

export function isPokedexComplete(list = getCaughtPokemonList()) {
    return countCaughtAvailable(list) >= getMaxPokemonId();
}

export function canUnlockMore() {
    return getMaxPokemonId() < TOTAL_POKEMON;
}

// Raise the limit to `to` (capped at the data) and persist it in the
// account's config override. Returns { from, to, pokemon } with the newly
// available entries (from < id <= to), or null when everything is unlocked.
function unlockTo(to) {
    const from = getMaxPokemonId();
    if (from >= TOTAL_POKEMON) return null;
    const capped = setMaxPokemonId(Math.min(to, TOTAL_POKEMON));
    const override = getAccountConfigOverride();
    setAccountConfigOverride({ ...override, pokedex: { ...(override.pokedex || {}), maxPokemonId: capped } });
    return { from, to: capped, pokemon: POKEMON_DATA.filter(p => p.id > from && p.id <= capped) };
}

// Unlock up to the next batch boundary (151 -> 251 -> 351 ...). A pool that
// was nudged past a boundary by unlockOne() still lands on the next one.
export function unlockNextBatch() {
    const from = getMaxPokemonId();
    const batches = Math.floor((from - DEFAULT_MAX_POKEMON_ID) / UNLOCK_BATCH_SIZE) + 1;
    return unlockTo(DEFAULT_MAX_POKEMON_ID + batches * UNLOCK_BATCH_SIZE);
}

// Quietly add a single Pokemon to the pool. Same return shape as unlockNextBatch.
export function unlockOne() {
    return unlockTo(getMaxPokemonId() + 1);
}

export function markCelebrationDue() {
    setBool(CELEBRATION_DUE_KEY, true);
}

export function isCelebrationDue() {
    return getBool(CELEBRATION_DUE_KEY, false);
}

export function clearCelebrationDue() {
    remove(CELEBRATION_DUE_KEY);
}
