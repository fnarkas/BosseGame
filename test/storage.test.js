import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getJSON, setJSON, getInt, setInt, getFloat, setFloat, getBool, setBool, getString, setString, remove, has,
    loadState, getAllValues, onStorageChange, resetStorage, readLegacyLocalData, clearLegacyLocalData, DEVICE_KEYS
} from '../src/storage.js';
import { getCoinCount, addCoins } from '../src/currency.js';
import { getStreak, incrementStreak, MAX_STREAK } from '../src/streak.js';
import { getInventory, addPokeball } from '../src/inventory.js';
import { getCaughtPokemonList, caughtIdSet } from '../src/caughtPokemon.js';
import { getWrongAnswersData } from '../src/wrongAnswers.js';

describe('storage helpers', () => {
    beforeEach(() => resetStorage());

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
        loadState({ n: 'abc', j: '{not json', arr: '{"a":1}' });
        expect(getInt('n', 3)).toBe(3);
        expect(getFloat('n', 0.5)).toBe(0.5);
        expect(getJSON('j', [])).toEqual([]);
        expect(getJSON('arr', [], Array.isArray)).toEqual([]);
    });

    it('keeps account state in memory, never in localStorage', () => {
        setString('coinCount', '9');
        expect(localStorage.getItem('coinCount')).toBeNull();
        expect(getAllValues()).toEqual({ coinCount: '9' });
        loadState({ coinCount: '3', streakMultiplier: '2', gameVolume: '0.5', bogus: 5 });
        expect(getAllValues()).toEqual({ coinCount: '3', streakMultiplier: '2' });
    });

    it('notifies listeners of writes and removals of account state only', () => {
        const seen = [];
        const stop = onStorageChange((key, value) => seen.push([key, value]));
        setInt('coinCount', 4);
        setFloat('gameVolume', 0.3);
        remove('coinCount');
        remove('coinCount');
        stop();
        setInt('coinCount', 1);
        expect(seen).toEqual([['coinCount', '4'], ['coinCount', null]]);
    });

    it('keeps device settings in localStorage and survives a throwing store', () => {
        expect(DEVICE_KEYS.has('gameVolume')).toBe(true);
        setFloat('gameVolume', 0.25);
        expect(localStorage.getItem('gameVolume')).toBe('0.25');
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
        expect(setString('gameVolume', '0.5')).toBe(false);
        spy.mockRestore();
        const getSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(getString('gameVolume', 'fallback')).toBe('fallback');
        getSpy.mockRestore();
    });

    it('exposes progress an older version left in localStorage, minus device keys', () => {
        localStorage.setItem('coinCount', '12');
        localStorage.setItem('pokemonCaughtList', '[1]');
        localStorage.setItem('gameVolume', '0.5');
        localStorage.setItem('accountName', 'Olle');
        expect(readLegacyLocalData()).toEqual({ coinCount: '12', pokemonCaughtList: '[1]' });
        clearLegacyLocalData();
        expect(readLegacyLocalData()).toEqual({});
        expect(localStorage.getItem('gameVolume')).toBe('0.5');
        expect(localStorage.getItem('accountName')).toBe('Olle');
    });
});

describe('game state survives corrupt saves', () => {
    beforeEach(() => resetStorage());
    afterEach(() => vi.restoreAllMocks());

    it('coins: garbage becomes 0 and adding still works', () => {
        loadState({ coinCount: 'lots' });
        expect(getCoinCount()).toBe(0);
        expect(addCoins(5)).toBe(5);
        loadState({ coinCount: '-20' });
        expect(getCoinCount()).toBe(0);
    });

    it('streak: clamped to the valid range', () => {
        loadState({ streakMultiplier: '999' });
        expect(getStreak()).toBe(MAX_STREAK);
        loadState({ streakMultiplier: 'x' });
        expect(getStreak()).toBe(0);
        expect(incrementStreak()).toBe(1);
    });

    it('inventory: unknown keys dropped, bad counts zeroed', () => {
        loadState({ inventory: JSON.stringify({ pokeball: '3', greatball: -1, ultraball: 'x', hack: 99 }) });
        expect(getInventory()).toEqual({ pokeball: 3, greatball: 0, ultraball: 0, legendaryball: 0 });
        loadState({ inventory: '[1,2]' });
        expect(getInventory()).toEqual({ pokeball: 0, greatball: 0, ultraball: 0, legendaryball: 0 });
        expect(addPokeball('pokeball')).toBe(1);
    });

    it('caught list: corrupt JSON gives an empty list; legacy id form still maps', () => {
        loadState({ pokemonCaughtList: '{{' });
        expect(getCaughtPokemonList()).toEqual([]);
        loadState({ pokemonCaughtList: JSON.stringify([1, { id: 2, name: 'x' }]) });
        expect([...caughtIdSet()]).toEqual([1, 2]);
    });

    it('wrong answers: a corrupt blob is replaced by the default structure', () => {
        loadState({ wrongAnswers: '"string"' });
        expect(getWrongAnswersData().mistakeCounts).toBeTypeOf('object');
    });
});
