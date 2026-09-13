import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorage } from '../src/storage.js';
import { POKEMON_DATA } from '../src/pokemonData.js';
import { getMaxPokemonId, setMaxPokemonId, getAvailablePokemon, resetPokemonPool, TOTAL_POKEMON } from '../src/pokemonPool.js';
import { getAccountConfigOverride, setAccountConfigOverride } from '../src/minigameConfig.js';
import {
    countCaughtAvailable, isPokedexComplete, canUnlockMore, unlockNextBatch, unlockOne,
    markCelebrationDue, isCelebrationDue, clearCelebrationDue, UNLOCK_BATCH_SIZE
} from '../src/pokedexUnlock.js';
import { saveCaughtPokemonList } from '../src/caughtPokemon.js';

const caughtUpTo = (max) => POKEMON_DATA.filter(p => p.id <= max).map(p => ({ id: p.id, name: p.name, caughtDate: 'x' }));

describe('pokedexUnlock', () => {
    beforeEach(() => {
        resetStorage();
        resetPokemonPool();
    });

    it('counts only Pokemon in the pool as caught, accepting legacy plain ids', () => {
        expect(countCaughtAvailable([1, { id: 151 }, { id: 152 }, 9999, null])).toBe(2);
        expect(isPokedexComplete(caughtUpTo(150))).toBe(false);
        expect(isPokedexComplete(caughtUpTo(151))).toBe(true);
        expect(isPokedexComplete(caughtUpTo(151).map(p => p.id))).toBe(true);
    });

    it('unlocks the next hundred and writes it where the admin panel saves the pool size', () => {
        saveCaughtPokemonList(caughtUpTo(151));
        setAccountConfigOverride({ wordSpelling: { requiredWords: 2 } });
        expect(canUnlockMore()).toBe(true);
        const batch = unlockNextBatch();
        expect(batch.from).toBe(151);
        expect(batch.to).toBe(151 + UNLOCK_BATCH_SIZE);
        expect(batch.pokemon).toHaveLength(100);
        expect(batch.pokemon[0].name).toBe('Chikorita');
        expect(getMaxPokemonId()).toBe(251);
        expect(getAvailablePokemon()).toHaveLength(251);
        // Persisted next to the other sections, none of them lost
        expect(getAccountConfigOverride()).toEqual({ wordSpelling: { requiredWords: 2 }, pokedex: { maxPokemonId: 251 } });
        // Not complete any more: 100 new ones to catch
        expect(isPokedexComplete()).toBe(false);
        expect(countCaughtAvailable()).toBe(151);
    });

    it('unlocks a single extra Pokemon and still lands the next batch on the boundary', () => {
        const one = unlockOne();
        expect(one).toEqual({ from: 151, to: 152, pokemon: [POKEMON_DATA[151]] });
        expect(getAccountConfigOverride().pokedex.maxPokemonId).toBe(152);
        expect(isPokedexComplete(caughtUpTo(151))).toBe(false);
        expect(isPokedexComplete(caughtUpTo(152))).toBe(true);
        const batch = unlockNextBatch();
        expect(batch.from).toBe(152);
        expect(batch.to).toBe(251);
        expect(batch.pokemon).toHaveLength(99);
        expect(unlockNextBatch().to).toBe(351);
    });

    it('works from a pool size the parent chose by hand', () => {
        setMaxPokemonId(386);
        expect(unlockNextBatch().to).toBe(451);
    });

    it('stops at the last Pokemon in the data', () => {
        setMaxPokemonId(TOTAL_POKEMON - 10);
        const batch = unlockNextBatch();
        expect(batch.to).toBe(TOTAL_POKEMON);
        expect(batch.pokemon).toHaveLength(10);
        expect(canUnlockMore()).toBe(false);
        expect(unlockNextBatch()).toBeNull();
        expect(unlockOne()).toBeNull();
    });

    it('remembers that a catch completed the Pokedex until the celebration runs', () => {
        expect(isCelebrationDue()).toBe(false);
        markCelebrationDue();
        expect(isCelebrationDue()).toBe(true);
        clearCelebrationDue();
        expect(isCelebrationDue()).toBe(false);
    });
});
