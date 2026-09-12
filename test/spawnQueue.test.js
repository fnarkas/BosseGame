import { describe, it, expect, beforeEach } from 'vitest';
import { getJSON, setJSON } from '../src/storage.js';
import { saveCaughtPokemonList } from '../src/caughtPokemon.js';
import { setMaxPokemonId, resetPokemonPool, getAvailablePokemon } from '../src/pokemonPool.js';
import {
    SPAWN_QUEUE_KEY, SPAWN_QUEUE_LENGTH, TUTORIAL_POKEMON_IDS, getSpawnQueue, fillSpawnQueue, peekSpawnQueue,
    takeNextSpawn, queueSpawn, queueGift, nextSpawnIsGift, removeFromSpawnQueue, reshuffleSpawnQueue, clearSpawnQueue
} from '../src/spawnQueue.js';

const ids = (queue) => queue.map(entry => entry.id);
const caughtList = (list) => list.map(id => ({ id, name: `p${id}`, caughtDate: '2026-01-01' }));
// A deterministic "random" that always picks the first candidate.
const first = () => 0;

describe('spawn queue', () => {
    beforeEach(() => resetPokemonPool());

    it('starts with the tutorial trio and fills up with uncaught Pokemon, no duplicates', () => {
        const queue = fillSpawnQueue();
        expect(queue).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(ids(queue).slice(0, 3)).toEqual(TUTORIAL_POKEMON_IDS);
        expect(new Set(ids(queue)).size).toBe(SPAWN_QUEUE_LENGTH);
        expect(queue.every(entry => entry.pinned === false)).toBe(true);
        expect(queue.every(entry => entry.id >= 1 && entry.id <= 151)).toBe(true);
        // Persisted in the account state.
        expect(getJSON(SPAWN_QUEUE_KEY, null)).toEqual(queue);
    });

    it('only queues the tutorial Pokemon that are still uncaught, and none after three catches', () => {
        saveCaughtPokemonList(caughtList([95]));
        expect(ids(fillSpawnQueue({ random: first })).slice(0, 2)).toEqual([41, 86]);
        clearSpawnQueue();
        saveCaughtPokemonList(caughtList([95, 41, 86]));
        const queue = fillSpawnQueue({ random: first });
        expect(ids(queue)).not.toContain(95);
        expect(ids(queue)[0]).toBe(1); // first uncaught with random = 0
    });

    it('never draws a caught Pokemon while any is left uncaught', () => {
        const caught = getAvailablePokemon().map(p => p.id).filter(id => id > 12);
        saveCaughtPokemonList(caughtList(caught));
        const queue = fillSpawnQueue();
        expect(queue).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(ids(queue).every(id => id <= 12)).toBe(true);
        expect(new Set(ids(queue)).size).toBe(SPAWN_QUEUE_LENGTH);
    });

    it('lets everything appear again once the whole pool is caught', () => {
        setMaxPokemonId(4);
        saveCaughtPokemonList(caughtList([1, 2, 3, 4]));
        const queue = fillSpawnQueue();
        expect(queue).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(ids(queue).every(id => id >= 1 && id <= 4)).toBe(true);
    });

    it('takeNextSpawn pops the front and keeps the queue full', () => {
        const before = ids(fillSpawnQueue());
        const spawned = takeNextSpawn();
        expect(spawned.id).toBe(before[0]);
        expect(spawned.name).toBe('Onix');
        const after = ids(getSpawnQueue());
        expect(after).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(after.slice(0, SPAWN_QUEUE_LENGTH - 1)).toEqual(before.slice(1));
    });

    it('trusts the caught set passed in (the scene registry) over the stored list', () => {
        const caught = new Set([95, 41, 86]);
        expect(takeNextSpawn({ caught, random: first }).id).toBe(1);
    });

    it('a chosen Pokemon goes to the front, pinned, and is not duplicated', () => {
        fillSpawnQueue();
        queueSpawn(25);
        expect(ids(getSpawnQueue())[0]).toBe(25);
        expect(getSpawnQueue()[0].pinned).toBe(true);
        queueSpawn(25);
        expect(ids(getSpawnQueue()).filter(id => id === 25)).toHaveLength(1);
        queueSpawn(6, { atFront: false });
        expect(ids(getSpawnQueue()).at(-1)).toBe(6);
        expect(takeNextSpawn().name).toBe('Pikachu');
    });

    it('ignores a chosen id that is not a Pokemon', () => {
        fillSpawnQueue();
        const before = ids(getSpawnQueue());
        queueSpawn(99999);
        expect(ids(getSpawnQueue())).toEqual(before);
    });

    it('keeps a pinned Pokemon even after it is caught, but drops caught random picks', () => {
        saveCaughtPokemonList(caughtList([95, 41, 86]));
        fillSpawnQueue({ random: first });
        const randomPick = ids(getSpawnQueue())[0];
        queueSpawn(25);
        saveCaughtPokemonList(caughtList([95, 41, 86, 25, randomPick]));
        const queue = fillSpawnQueue({ random: first });
        expect(ids(queue)[0]).toBe(25);
        expect(ids(queue)).not.toContain(randomPick);
        expect(queue).toHaveLength(SPAWN_QUEUE_LENGTH);
    });

    it('drops queued Pokemon that fall outside a lowered pool', () => {
        setMaxPokemonId(251);
        setJSON(SPAWN_QUEUE_KEY, [{ id: 200, pinned: true }, { id: 3, pinned: false }]);
        setMaxPokemonId(151);
        const queue = fillSpawnQueue();
        expect(ids(queue)).not.toContain(200);
        expect(ids(queue)).toContain(3);
    });

    it('cleans junk out of a stored queue', () => {
        setJSON(SPAWN_QUEUE_KEY, [null, 'x', { id: 'a' }, { id: 7 }, { id: 8, pinned: 1 }]);
        expect(getSpawnQueue()).toEqual([{ id: 7, pinned: false }, { id: 8, pinned: true }]);
        setJSON(SPAWN_QUEUE_KEY, { not: 'a list' });
        expect(getSpawnQueue()).toEqual([]);
    });

    it('removes one slot and reshuffles only the random picks', () => {
        fillSpawnQueue();
        queueSpawn(150);
        const before = ids(getSpawnQueue());
        expect(before).toHaveLength(SPAWN_QUEUE_LENGTH + 1); // the chosen one on top of the ten
        removeFromSpawnQueue(1);
        expect(ids(getSpawnQueue())).toEqual([before[0], ...before.slice(2)]);
        removeFromSpawnQueue(99); // out of range: no change
        expect(getSpawnQueue()).toHaveLength(SPAWN_QUEUE_LENGTH);

        const reshuffled = reshuffleSpawnQueue({ random: first });
        expect(reshuffled).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(ids(reshuffled)[0]).toBe(150);
        expect(reshuffled[0].pinned).toBe(true);
        expect(reshuffled.slice(1).every(entry => !entry.pinned)).toBe(true);
    });

    it('a present goes to the front, pinned, survives fills and reshuffles, and is popped as { gift }', () => {
        fillSpawnQueue();
        queueGift({ coins: 10, pokeball: 2, junk: 5, ultraball: 0 });
        expect(getSpawnQueue()[0]).toEqual({ gift: { coins: 10, pokeball: 2 }, pinned: true });
        expect(getSpawnQueue()).toHaveLength(SPAWN_QUEUE_LENGTH + 1);
        expect(nextSpawnIsGift()).toBe(true);
        expect(peekSpawnQueue()[0]).toEqual({ gift: { coins: 10, pokeball: 2 }, pinned: true });
        expect(peekSpawnQueue()[1]).toMatchObject({ id: 95, name: 'Onix' });

        saveCaughtPokemonList(caughtList([1, 2, 3]));
        expect(ids(reshuffleSpawnQueue({ random: first }))[0]).toBeUndefined();
        expect(getSpawnQueue()[0].gift).toEqual({ coins: 10, pokeball: 2 });
        expect(getSpawnQueue()).toHaveLength(SPAWN_QUEUE_LENGTH);

        expect(takeNextSpawn()).toEqual({ gift: { coins: 10, pokeball: 2 } });
        expect(nextSpawnIsGift()).toBe(false);
        expect(getSpawnQueue()).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(getSpawnQueue().some(entry => entry.gift)).toBe(false);
    });

    it('ignores an empty present and cleans a broken stored one', () => {
        fillSpawnQueue();
        const before = getSpawnQueue();
        queueGift({ coins: 0 });
        queueGift(null);
        expect(getSpawnQueue()).toEqual(before);
        setJSON(SPAWN_QUEUE_KEY, [{ gift: { coins: 'x' } }, { gift: { greatball: 3 }, pinned: false }, { id: 4 }]);
        expect(getSpawnQueue()).toEqual([{ gift: { greatball: 3 }, pinned: true }, { id: 4, pinned: false }]);
        queueGift({ coins: 5 }, { atFront: false });
        expect(getSpawnQueue().at(-1)).toEqual({ gift: { coins: 5 }, pinned: true });
    });

    it('peekSpawnQueue returns the Pokemon data in order with the pinned flag', () => {
        queueSpawn(1);
        const peek = peekSpawnQueue();
        expect(peek).toHaveLength(SPAWN_QUEUE_LENGTH);
        expect(peek[0]).toMatchObject({ id: 1, name: 'Bulbasaur', pinned: true, filename: '001_bulbasaur.png' });
        expect(peek[1]).toMatchObject({ id: 95, name: 'Onix', pinned: false });
    });
});
