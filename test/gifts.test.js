import { describe, it, expect } from 'vitest';
import { GIFT_ITEMS, normalizeGift, giftContents, describeGift, grantGift } from '../src/gifts.js';
import { getCoinCount, addCoins } from '../src/currency.js';
import { getInventory, addPokeball, POKEBALL_TYPES, MAX_ITEM_COUNT } from '../src/inventory.js';

describe('gifts', () => {
    it('lists coins and every pokeball type, in that order', () => {
        expect(GIFT_ITEMS.map(item => item.id)).toEqual(['coins', ...Object.keys(POKEBALL_TYPES)]);
        for (const item of GIFT_ITEMS) {
            expect(item.sprite).toBeTruthy();
            expect(item.image).toBeTruthy();
            expect(item.label).toBeTruthy();
        }
    });

    it('normalises a present to known items with positive integer counts', () => {
        expect(normalizeGift({ coins: 10, pokeball: '2', greatball: 0, ultraball: -3, streak: 5, x: 1 })).toEqual({ coins: 10, pokeball: 2 });
        expect(normalizeGift({ coins: 2.7, legendaryball: 1e9 })).toEqual({ coins: 2, legendaryball: MAX_ITEM_COUNT });
        expect(normalizeGift({})).toBeNull();
        expect(normalizeGift({ coins: 'lots' })).toBeNull();
        expect(normalizeGift(null)).toBeNull();
        expect(normalizeGift([5])).toBeNull();
    });

    it('describes the contents in display order', () => {
        expect(describeGift({ pokeball: 2, coins: 10 })).toBe('10 Coins · 2 Poké Ball');
        expect(giftContents({ ultraball: 1 })).toEqual([expect.objectContaining({ id: 'ultraball', count: 1, sprite: 'pokeball_ultra-ball-tiny' })]);
        expect(describeGift({})).toBe('');
    });

    it('puts the contents in the bag on top of what is there', () => {
        addCoins(5);
        addPokeball('pokeball');
        expect(grantGift({ coins: 10, pokeball: 2, legendaryball: 1, junk: 9 })).toEqual({ coins: 10, pokeball: 2, legendaryball: 1 });
        expect(getCoinCount()).toBe(15);
        expect(getInventory()).toEqual({ pokeball: 3, greatball: 0, ultraball: 0, legendaryball: 1 });
        expect(grantGift({})).toBeNull();
        expect(getCoinCount()).toBe(15);
    });
});
