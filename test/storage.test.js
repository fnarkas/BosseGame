import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getJSON, setJSON, getInt, setInt, getFloat, getBool, setBool, getString, setString, remove, has } from '../src/storage.js';
import { getCoinCount, addCoins } from '../src/currency.js';
import { getStreak, incrementStreak, MAX_STREAK } from '../src/streak.js';
import { getInventory, addPokeball } from '../src/inventory.js';
import { getCaughtPokemonList, caughtIdSet } from '../src/caughtPokemon.js';
import { getWrongAnswersData } from '../src/wrongAnswers.js';

describe('storage helpers', () => {
    beforeEach(() => localStorage.clear());

    it('round-trips strings, ints, floats, booleans and JSON', () => {
        setString('s', 'hi'); expect(getString('s')).toBe('hi');
        setInt('i', 42.9); expect(getInt('i')).toBe(42);
        setBool('b', true); expect(getBool('b')).toBe(true);
        setJSON('j', { a: [1, 2] }); expect(getJSON('j', null)).toEqual({ a: [1, 2] });
        expect(has('j')).toBe(true);
        remove('j');
        expect(has('j')).toBe(false);
        expect(getJSON('j', 'dflt')).toBe('dflt');
    });

    it('falls back on missing or corrupt values instead of throwing', () => {
        expect(getInt('nope', 7)).toBe(7);
        localStorage.setItem('n', 'abc');
        expect(getInt('n', 3)).toBe(3);
        expect(getFloat('n', 0.5)).toBe(0.5);
        localStorage.setItem('j', '{not json');
        expect(getJSON('j', [])).toEqual([]);
        localStorage.setItem('arr', '{"a":1}');
        expect(getJSON('arr', [], Array.isArray)).toEqual([]);
    });

    it('keeps working in memory when localStorage throws', () => {
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
        expect(setString('k', 'v')).toBe(false);
        spy.mockRestore();
        const getSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(getString('k', 'fallback')).toBe('fallback');
        getSpy.mockRestore();
    });
});

describe('game state survives corrupt saves', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('coins: garbage becomes 0 and adding still works', () => {
        localStorage.setItem('coinCount', 'lots');
        expect(getCoinCount()).toBe(0);
        expect(addCoins(5)).toBe(5);
        localStorage.setItem('coinCount', '-20');
        expect(getCoinCount()).toBe(0);
    });

    it('streak: clamped to the valid range', () => {
        localStorage.setItem('streakMultiplier', '999');
        expect(getStreak()).toBe(MAX_STREAK);
        localStorage.setItem('streakMultiplier', 'x');
        expect(getStreak()).toBe(0);
        expect(incrementStreak()).toBe(1);
    });

    it('inventory: unknown keys dropped, bad counts zeroed', () => {
        localStorage.setItem('inventory', JSON.stringify({ pokeball: '3', greatball: -1, ultraball: 'x', hack: 99 }));
        expect(getInventory()).toEqual({ pokeball: 3, greatball: 0, ultraball: 0, legendaryball: 0 });
        localStorage.setItem('inventory', '[1,2]');
        expect(getInventory()).toEqual({ pokeball: 0, greatball: 0, ultraball: 0, legendaryball: 0 });
        expect(addPokeball('pokeball')).toBe(1);
    });

    it('caught list: corrupt JSON gives an empty list; legacy id form still maps', () => {
        localStorage.setItem('pokemonCaughtList', '{{');
        expect(getCaughtPokemonList()).toEqual([]);
        localStorage.setItem('pokemonCaughtList', JSON.stringify([1, { id: 2, name: 'x' }]));
        expect([...caughtIdSet()]).toEqual([1, 2]);
    });

    it('wrong answers: a corrupt blob is replaced by the default structure', () => {
        localStorage.setItem('wrongAnswers', '"string"');
        expect(getWrongAnswersData().mistakeCounts).toBeTypeOf('object');
    });
});
