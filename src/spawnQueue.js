// The order the Pokemon appear in, saved in the account state.
//
// Encounters used to be drawn at random the moment they were needed, so there
// was no way to know (or decide) who comes next. Now the next few encounters
// are drawn ahead of time and stored under SPAWN_QUEUE_KEY, synced to the
// server like every other saved value. The game takes the first entry for each
// encounter (takeNextSpawn); /admin shows the same list and can push a chosen
// Pokemon to the front (queueSpawn). Entries a parent placed are "pinned":
// they stay even if the Pokemon is already caught.
//
// Filling rules (fillSpawnQueue):
//   - the tutorial trio (Onix, Zubat, Seel) first while fewer than three
//     Pokemon are caught, so the first catches are the guaranteed ones;
//   - then uncaught Pokemon from the available pool, no duplicates;
//   - when everything is caught, any available Pokemon.
// Random (unpinned) entries that have since been caught, and entries outside
// the current pool (the parent lowered the limit), are dropped on the next fill.

import { getJSON, setJSON } from './storage.js';
import { caughtIdSet } from './caughtPokemon.js';
import { getAvailablePokemon, getPokemonById, isPokemonAvailable } from './pokemonPool.js';

export const SPAWN_QUEUE_KEY = 'pokemonSpawnQueue';
export const SPAWN_QUEUE_LENGTH = 10;
export const TUTORIAL_POKEMON_IDS = [95, 41, 86]; // Onix, Zubat, Seel: 100% catch rate

const isEntry = (entry) => !!entry && typeof entry === 'object' && Number.isInteger(entry.id) && entry.id > 0;

// The stored queue, with anything that is not a { id, pinned } entry removed.
export function getSpawnQueue() {
    const stored = getJSON(SPAWN_QUEUE_KEY, [], Array.isArray);
    return stored.filter(isEntry).map(entry => ({ id: entry.id, pinned: !!entry.pinned }));
}

export function saveSpawnQueue(queue) {
    setJSON(SPAWN_QUEUE_KEY, queue.map(entry => ({ id: entry.id, pinned: !!entry.pinned })));
    return queue;
}

function randomFrom(list, random) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

// Make sure at least `length` entries are queued, dropping stale ones first,
// and persist the result. `random` is injectable for tests.
export function fillSpawnQueue({ length = SPAWN_QUEUE_LENGTH, random = Math.random, caught = caughtIdSet() } = {}) {
    const before = JSON.stringify(getSpawnQueue());
    const available = getAvailablePokemon();
    const allCaught = available.every(pokemon => caught.has(pokemon.id));
    const queue = getSpawnQueue().filter(entry =>
        isPokemonAvailable(entry.id) && (entry.pinned || allCaught || !caught.has(entry.id))
    );
    const queued = new Set(queue.map(entry => entry.id));

    if (caught.size < TUTORIAL_POKEMON_IDS.length) {
        for (const id of TUTORIAL_POKEMON_IDS) {
            if (queue.length >= length) break;
            if (caught.has(id) || queued.has(id) || !isPokemonAvailable(id)) continue;
            queue.push({ id, pinned: false });
            queued.add(id);
        }
    }

    while (queue.length < length) {
        let pool = available.filter(pokemon => !queued.has(pokemon.id) && !caught.has(pokemon.id));
        if (pool.length === 0) pool = available.filter(pokemon => !queued.has(pokemon.id));
        if (pool.length === 0) pool = available;
        if (pool.length === 0) break;
        const pick = randomFrom(pool, random);
        queue.push({ id: pick.id, pinned: false });
        queued.add(pick.id);
    }

    if (JSON.stringify(queue) !== before) saveSpawnQueue(queue);
    return queue;
}

// The queued Pokemon as data objects (for display), in encounter order.
export function peekSpawnQueue(options = {}) {
    return fillSpawnQueue(options).map(entry => ({ ...getPokemonById(entry.id), pinned: entry.pinned }));
}

// Pop the next encounter and top the queue up again, so the saved state always
// holds the full look-ahead. Returns the Pokemon data object, or null when the
// pool is empty.
export function takeNextSpawn(options = {}) {
    const queue = fillSpawnQueue(options);
    const next = queue.shift();
    if (!next) return null;
    saveSpawnQueue(queue);
    fillSpawnQueue(options);
    return getPokemonById(next.id);
}

// A parent's choice: put `id` at the front (default) or the back, pinned. A
// Pokemon already in the queue moves rather than appearing twice.
export function queueSpawn(id, { atFront = true } = {}) {
    if (!getPokemonById(id)) return getSpawnQueue();
    const rest = getSpawnQueue().filter(entry => entry.id !== id);
    const entry = { id, pinned: true };
    return saveSpawnQueue(atFront ? [entry, ...rest] : [...rest, entry]);
}

export function removeFromSpawnQueue(index) {
    const queue = getSpawnQueue();
    if (index < 0 || index >= queue.length) return queue;
    queue.splice(index, 1);
    return saveSpawnQueue(queue);
}

// Throw away the random picks (pinned ones stay) and draw again.
export function reshuffleSpawnQueue(options = {}) {
    saveSpawnQueue(getSpawnQueue().filter(entry => entry.pinned));
    return fillSpawnQueue(options);
}

export function clearSpawnQueue() {
    return saveSpawnQueue([]);
}
