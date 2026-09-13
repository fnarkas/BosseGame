// Which Pokemon the player can meet right now.
//
// The game starts with the first generation (#1-151). When every available
// Pokemon has been caught the game celebrates and unlocks the next hundred
// (#152-251, then #252-351, ...) until all of POKEMON_DATA is in play. The
// unlocked ceiling is part of the account state, so it follows the child
// between devices like the caught list does.

import { POKEMON_DATA } from './pokemonData.js';
import { getInt, setInt, getBool, setBool, remove } from './storage.js';
import { getCaughtPokemonList, caughtIdSet } from './caughtPokemon.js';

export const UNLOCKED_MAX_KEY = 'pokemonUnlockedMax';
// Set by the catch that completes the Pokedex, cleared when the celebration
// starts. A Pokedex that is complete without it (admin "catch all", a save
// from before unlocking existed) gets one more Pokemon slipped in instead, so
// the party always follows a catch.
export const CELEBRATION_DUE_KEY = 'pokedexCelebrationDue';
export const BASE_POKEMON_COUNT = 151;
export const UNLOCK_BATCH_SIZE = 100;
export const TOTAL_POKEMON = POKEMON_DATA.length;

// Highest Pokemon id that can currently be encountered (151 for a new player).
export function getUnlockedMax() {
    const stored = getInt(UNLOCKED_MAX_KEY, BASE_POKEMON_COUNT);
    return Math.min(Math.max(stored, BASE_POKEMON_COUNT), TOTAL_POKEMON);
}

export function getAvailablePokemon() {
    const max = getUnlockedMax();
    return POKEMON_DATA.filter(pokemon => pokemon.id <= max);
}

// How many of the currently available Pokemon are in the caught list.
export function countCaughtAvailable(list = getCaughtPokemonList()) {
    const max = getUnlockedMax();
    let count = 0;
    for (const id of caughtIdSet(list)) {
        if (Number.isInteger(id) && id >= 1 && id <= max) count += 1;
    }
    return count;
}

export function isPokedexComplete(list = getCaughtPokemonList()) {
    return countCaughtAvailable(list) >= getUnlockedMax();
}

export function canUnlockMore() {
    return getUnlockedMax() < TOTAL_POKEMON;
}

function unlockTo(to) {
    const from = getUnlockedMax();
    if (from >= TOTAL_POKEMON) return null;
    const capped = Math.min(to, TOTAL_POKEMON);
    setInt(UNLOCKED_MAX_KEY, capped);
    return { from, to: capped, pokemon: POKEMON_DATA.filter(p => p.id > from && p.id <= capped) };
}

// Unlock up to the next batch boundary (151 -> 251 -> 351 ...) and return it:
// { from, to, pokemon } where `pokemon` are the newly available entries
// (from < id <= to). A pool that was nudged past a boundary by unlockOne()
// still lands on the next boundary. Returns null when everything is unlocked.
export function unlockNextBatch() {
    const from = getUnlockedMax();
    const batches = Math.floor((from - BASE_POKEMON_COUNT) / UNLOCK_BATCH_SIZE) + 1;
    return unlockTo(BASE_POKEMON_COUNT + batches * UNLOCK_BATCH_SIZE);
}

// Quietly add a single Pokemon to the pool. Same return shape as unlockNextBatch.
export function unlockOne() {
    return unlockTo(getUnlockedMax() + 1);
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
