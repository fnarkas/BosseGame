// Presents a parent puts in the spawn queue from /admin (spawnQueue.js).
//
// A gift holds the same things as the bag: coins and Poké Balls of every
// kind. When it reaches the front of the queue the catching scene shows a
// gift box instead of a Pokemon; tapping it grants the contents. Only the
// admin panel creates gifts; the game just opens them.

import { addCoins } from './currency.js';
import { getInventory, setPokeballCount, POKEBALL_TYPES, clampCount } from './inventory.js';

// One entry per thing a gift can hold, in display order. `sprite` is the
// boot-loaded texture the scene draws; `image` the file the admin shows.
export const GIFT_ITEMS = [
    { id: 'coins', label: 'Coins', sprite: 'coin-tiny', image: 'coin.png', spriteScale: 1 },
    { id: 'pokeball', label: POKEBALL_TYPES.pokeball.name, sprite: 'pokeball_poke-ball-tiny', image: 'pokeball_sprites/poke-ball.png', spriteScale: 1.1 },
    { id: 'greatball', label: POKEBALL_TYPES.greatball.name, sprite: 'pokeball_great-ball-tiny', image: 'pokeball_sprites/great-ball.png', spriteScale: 1.1 },
    { id: 'ultraball', label: POKEBALL_TYPES.ultraball.name, sprite: 'pokeball_ultra-ball-tiny', image: 'pokeball_sprites/ultra-ball.png', spriteScale: 1.1 },
    { id: 'legendaryball', label: POKEBALL_TYPES.legendaryball.name, sprite: 'pokeball_legendary-ball-tiny', image: 'pokeball_sprites/legendary-ball.png', spriteScale: 1.1 }
];

// Only known items with positive integer counts; null when there is nothing
// in the box (or the input is not an object at all).
export function normalizeGift(gift) {
    if (!gift || typeof gift !== 'object' || Array.isArray(gift)) return null;
    const clean = {};
    for (const item of GIFT_ITEMS) {
        const count = clampCount(gift[item.id]);
        if (count > 0) clean[item.id] = count;
    }
    return Object.keys(clean).length > 0 ? clean : null;
}

// [{ id, label, sprite, image, count }] for the items the gift holds.
export function giftContents(gift) {
    const clean = normalizeGift(gift) || {};
    return GIFT_ITEMS.filter(item => clean[item.id]).map(item => ({ ...item, count: clean[item.id] }));
}

// "10 Coins · 2 Poké Ball"
export function describeGift(gift) {
    return giftContents(gift).map(item => `${item.count} ${item.label}`).join(' · ');
}

// Put the contents in the bag. Returns what was granted.
export function grantGift(gift) {
    const clean = normalizeGift(gift);
    if (!clean) return null;
    if (clean.coins) addCoins(clean.coins);
    const inventory = getInventory();
    for (const type of Object.keys(POKEBALL_TYPES)) {
        if (clean[type]) setPokeballCount(type, inventory[type] + clean[type]);
    }
    return clean;
}
