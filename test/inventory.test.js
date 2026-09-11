import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorage } from '../src/storage.js';
import { getInventory, addPokeball, setPokeballCount, clampCount, MAX_ITEM_COUNT, POKEBALL_TYPES } from '../src/inventory.js';
import { getCoinCount, addCoins, setCoinCount } from '../src/currency.js';
import { getStreak, setStreak, incrementStreak, MAX_STREAK, STREAK_EXPIRY_MS } from '../src/streak.js';

describe('inventory setters (admin panel)', () => {
    beforeEach(() => resetStorage());

    it('clamps hand-typed counts to a sane integer range', () => {
        expect(clampCount('12')).toBe(12);
        expect(clampCount(3.9)).toBe(3);
        expect(clampCount(-5)).toBe(0);
        expect(clampCount('abc')).toBe(0);
        expect(clampCount(Infinity)).toBe(0);
        expect(clampCount(MAX_ITEM_COUNT + 1)).toBe(MAX_ITEM_COUNT);
        expect(clampCount(9, 5)).toBe(5);
    });

    it('sets one ball type without touching the others', () => {
        addPokeball('greatball');
        expect(setPokeballCount('ultraball', 7)).toBe(7);
        expect(getInventory()).toEqual({ pokeball: 0, greatball: 1, ultraball: 7, legendaryball: 0 });
        expect(setPokeballCount('ultraball', -3)).toBe(0);
        expect(getInventory().ultraball).toBe(0);
        expect(setPokeballCount('masterball', 1)).toBeNull();
        expect(Object.keys(POKEBALL_TYPES)).toEqual(['pokeball', 'greatball', 'ultraball', 'legendaryball']);
    });

    it('sets the coin balance outright', () => {
        addCoins(3);
        expect(setCoinCount(250)).toBe(250);
        expect(getCoinCount()).toBe(250);
        expect(setCoinCount('nope')).toBe(0);
        expect(getCoinCount()).toBe(0);
    });

    it('sets the streak within 0..MAX and clears it at 0', () => {
        const t0 = 1_700_000_000_000;
        expect(setStreak(3, t0)).toBe(3);
        expect(getStreak(t0)).toBe(3);
        expect(setStreak(99, t0)).toBe(MAX_STREAK);
        expect(setStreak(0, t0)).toBe(0);
        expect(getStreak(t0)).toBe(0);
        // A streak set by the admin ages like one earned in the game.
        setStreak(2, t0);
        expect(getStreak(t0 + STREAK_EXPIRY_MS + 1)).toBe(0);
        incrementStreak(t0);
        expect(getStreak(t0)).toBe(1);
    });
});
