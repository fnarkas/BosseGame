import { describe, it, expect, beforeEach } from 'vitest';
import { setTestConfig } from './helpers/setup.js';
import { POKEMON_DATA } from '../src/pokemonData.js';
import {
    DEFAULT_MAX_POKEMON_ID, TOTAL_POKEMON, GENERATIONS, getAvailablePokemon, getMaxPokemonId, setMaxPokemonId,
    clampMaxPokemonId, isPokemonAvailable, getPokemonById, applyPokedexConfig, resetPokemonPool
} from '../src/pokemonPool.js';

describe('pokemon pool', () => {
    beforeEach(() => resetPokemonPool());

    it('holds every generation in the data file, in dex order without gaps', () => {
        expect(TOTAL_POKEMON).toBe(POKEMON_DATA.length);
        expect(TOTAL_POKEMON).toBeGreaterThanOrEqual(1025);
        POKEMON_DATA.forEach((pokemon, index) => expect(pokemon.id).toBe(index + 1));
        expect(GENERATIONS.map(g => g.lastId)).toEqual([151, 251, 386, 493, 649, 721, 809, 905, 1025]);
    });

    it('defaults to the 151 Kanto Pokemon', () => {
        expect(getMaxPokemonId()).toBe(DEFAULT_MAX_POKEMON_ID);
        expect(getAvailablePokemon()).toHaveLength(151);
        expect(getAvailablePokemon().at(-1).name).toBe('Mew');
        expect(isPokemonAvailable(151)).toBe(true);
        expect(isPokemonAvailable(152)).toBe(false);
    });

    it('clamps the limit to a valid dex number', () => {
        expect(clampMaxPokemonId(0)).toBe(1);
        expect(clampMaxPokemonId('251')).toBe(251);
        expect(clampMaxPokemonId(251.6)).toBe(252);
        expect(clampMaxPokemonId(99999)).toBe(TOTAL_POKEMON);
        expect(clampMaxPokemonId('abc')).toBe(DEFAULT_MAX_POKEMON_ID);
        expect(clampMaxPokemonId(undefined)).toBe(DEFAULT_MAX_POKEMON_ID);
    });

    it('resizes the pool when the limit changes', () => {
        setMaxPokemonId(251);
        expect(getAvailablePokemon()).toHaveLength(251);
        expect(getAvailablePokemon().at(-1).name).toBe('Celebi');
        setMaxPokemonId(TOTAL_POKEMON);
        expect(getAvailablePokemon()).toHaveLength(TOTAL_POKEMON);
        setMaxPokemonId(3);
        expect(getAvailablePokemon().map(p => p.name)).toEqual(['Bulbasaur', 'Ivysaur', 'Venusaur']);
    });

    it('reads the limit from the pokedex config section', async () => {
        setTestConfig({ pokedex: { maxPokemonId: 386 } });
        const config = await applyPokedexConfig();
        expect(config.maxPokemonId).toBe(386);
        expect(getMaxPokemonId()).toBe(386);
        expect(getAvailablePokemon()).toHaveLength(386);
    });

    it('falls back to the default on a missing or broken config section', async () => {
        setTestConfig({ pokedex: { maxPokemonId: 'lots' } });
        expect((await applyPokedexConfig()).maxPokemonId).toBe(DEFAULT_MAX_POKEMON_ID);
        setTestConfig({ pokedex: { maxPokemonId: 5000 } });
        expect((await applyPokedexConfig()).maxPokemonId).toBe(TOTAL_POKEMON);
    });

    it('looks up any Pokemon by id, in or out of the pool', () => {
        expect(getPokemonById(25).name).toBe('Pikachu');
        expect(getPokemonById(1025).name).toBe('Pecharunt');
        expect(getPokemonById(0)).toBeNull();
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
