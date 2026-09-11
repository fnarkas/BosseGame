// The list of caught Pokemon, shared by the catching scene, the Pokedex
// overlay, the admin panel and BootScene (which seeds the registry from it).
//
// Stored shape: [{ id, name, caughtDate }]. Very old saves stored plain ids
// ([1, 2, 3]); readers must accept both, so use caughtIdSet() rather than
// mapping over the raw list.
import { getJSON, setJSON } from './storage.js';

export const CAUGHT_POKEMON_KEY = 'pokemonCaughtList';

export function getCaughtPokemonList() {
    return getJSON(CAUGHT_POKEMON_KEY, [], Array.isArray);
}

export function saveCaughtPokemonList(list) {
    return setJSON(CAUGHT_POKEMON_KEY, list);
}

// Set of caught Pokemon ids, accepting both the object and the legacy id form.
export function caughtIdSet(list = getCaughtPokemonList()) {
    return new Set(list.map(p => (p && typeof p === 'object') ? p.id : p));
}
