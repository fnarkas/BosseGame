import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorage, getInt, setInt } from '../src/storage.js';
import { POKEMON_DATA } from '../src/pokemonData.js';
import {
    getUnlockedMax, getAvailablePokemon, countCaughtAvailable, isPokedexComplete,
    canUnlockMore, unlockNextBatch, unlockOne, markCelebrationDue, isCelebrationDue, clearCelebrationDue,
    BASE_POKEMON_COUNT, UNLOCK_BATCH_SIZE, TOTAL_POKEMON, UNLOCKED_MAX_KEY
} from '../src/pokemonPool.js';
import { saveCaughtPokemonList } from '../src/caughtPokemon.js';

const caughtUpTo = (max) => POKEMON_DATA.filter(p => p.id <= max).map(p => ({ id: p.id, name: p.name, caughtDate: 'x' }));

describe('pokemonPool', () => {
    beforeEach(() => resetStorage());

    it('starts with the first generation unlocked', () => {
        expect(BASE_POKEMON_COUNT).toBe(151);
        expect(getUnlockedMax()).toBe(151);
        expect(getAvailablePokemon()).toHaveLength(151);
        expect(getAvailablePokemon().at(-1).name).toBe('Mew');
        expect(TOTAL_POKEMON).toBe(POKEMON_DATA.length);
    });

    it('clamps a corrupt stored ceiling into range', () => {
        setInt(UNLOCKED_MAX_KEY, 5);
        expect(getUnlockedMax()).toBe(151);
        setInt(UNLOCKED_MAX_KEY, 99999);
        expect(getUnlockedMax()).toBe(TOTAL_POKEMON);
    });

    it('counts only unlocked Pokemon as caught, accepting legacy plain ids', () => {
        expect(countCaughtAvailable([1, { id: 151 }, { id: 152 }, 9999, null])).toBe(2);
        expect(isPokedexComplete(caughtUpTo(150))).toBe(false);
        expect(isPokedexComplete(caughtUpTo(151))).toBe(true);
        expect(isPokedexComplete(caughtUpTo(151).map(p => p.id))).toBe(true);
    });

    it('unlocks the next hundred and persists it in account state', () => {
        saveCaughtPokemonList(caughtUpTo(151));
        expect(canUnlockMore()).toBe(true);
        const batch = unlockNextBatch();
        expect(batch.from).toBe(151);
        expect(batch.to).toBe(151 + UNLOCK_BATCH_SIZE);
        expect(batch.pokemon).toHaveLength(100);
        expect(batch.pokemon[0].name).toBe('Chikorita');
        expect(getInt(UNLOCKED_MAX_KEY)).toBe(251);
        expect(getAvailablePokemon()).toHaveLength(251);
        // Not complete any more: 100 new ones to catch
        expect(isPokedexComplete()).toBe(false);
        expect(countCaughtAvailable()).toBe(151);
    });

    it('unlocks a single extra Pokemon and still lands the next batch on the boundary', () => {
        const one = unlockOne();
        expect(one).toEqual({ from: 151, to: 152, pokemon: [POKEMON_DATA[151]] });
        expect(one.pokemon[0].name).toBe('Chikorita');
        expect(getUnlockedMax()).toBe(152);
        expect(isPokedexComplete(caughtUpTo(151))).toBe(false);
        expect(isPokedexComplete(caughtUpTo(152))).toBe(true);
        const batch = unlockNextBatch();
        expect(batch.from).toBe(152);
        expect(batch.to).toBe(251);
        expect(batch.pokemon).toHaveLength(99);
        expect(unlockNextBatch().to).toBe(351);
    });

    it('remembers that a catch completed the Pokedex until the celebration runs', () => {
        expect(isCelebrationDue()).toBe(false);
        markCelebrationDue();
        expect(isCelebrationDue()).toBe(true);
        clearCelebrationDue();
        expect(isCelebrationDue()).toBe(false);
    });

    it('stops at the last Pokemon in the data', () => {
        setInt(UNLOCKED_MAX_KEY, TOTAL_POKEMON - 10);
        const batch = unlockNextBatch();
        expect(batch.to).toBe(TOTAL_POKEMON);
        expect(batch.pokemon).toHaveLength(10);
        expect(canUnlockMore()).toBe(false);
        expect(unlockNextBatch()).toBeNull();
    });

    it('every Pokemon has a plain species name the child can spell', () => {
        // PokeAPI names default forms after the form ("deoxys-normal"); the
        // generator uses the species name instead.
        const multiHyphen = POKEMON_DATA.filter(p => (p.name.match(/-/g) || []).length > 1);
        expect(multiHyphen).toEqual([]);
        const formSuffix = POKEMON_DATA.filter(p => /-(normal|incarnate|male|average|standard|ordinary|aria|shield|solo|disguised|amped|ice|zero|curly|land|altered|plant|baile|midday|50)$/.test(p.name));
        expect(formSuffix).toEqual([]);
    });
});
