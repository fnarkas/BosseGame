// Adaptive item selection.
//
// The game records every wrong answer (wrongAnswers.js) but until now never
// read the data back: every mode picked its letter / number / word uniformly at
// random. This module turns the mistake history into weights so the things the
// child gets wrong come up more often, and so the distractors offered next to a
// target include the thing it is actually confused with (b next to d, 14 next
// to 40) instead of a random filler that teaches nothing.
//
// The parent's notes (bosses_progress.md) seed the model so day one is already
// targeted: confusable letter pairs, and the number ranges he stumbles on.

import { getGameModeMistakes } from './wrongAnswers.js';

// Letter pairs the child mixes up, from the parent's notes plus the classic
// mirror/rotation confusions. Symmetric.
export const CONFUSABLE_LETTERS = [
    ['A', 'E'], ['W', 'M'], ['D', 'B'], ['P', 'Q'], ['G', 'N'], ['G', 'H'], ['N', 'H'],
    ['B', 'P'], ['D', 'P'], ['U', 'V'], ['I', 'J'], ['I', 'L'], ['O', 'Q'], ['Å', 'Ä'], ['Ä', 'Ö'], ['A', 'Å'], ['O', 'Ö']
];

// Letters the notes single out as hard get a permanent boost.
export const HARD_LETTERS = ['A', 'E', 'W', 'M', 'D', 'B', 'P', 'Q', 'G', 'N', 'H'];

// Numbers the notes single out: teens, the round tens and the forties.
export const HARD_NUMBERS = [
    12, 13, 14, 15, 16, 17, 18, 19, 20,
    30, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 60, 70, 80, 90
];

// How strongly a recorded mistake raises an item's weight, and the ceiling so
// one badly-learned item can't take over the whole game.
const MISTAKE_WEIGHT = 2;
const SEED_WEIGHT = 1.5;
const MAX_WEIGHT = 8;

function norm(item) {
    return String(item).toUpperCase();
}

// Parse the mistake keys wrongAnswers.js writes ("b_confused_with_d",
// "14_vs_40") into { correct, wrong } pairs with counts.
export function parseMistakes(modeName) {
    const raw = getGameModeMistakes(modeName);
    const pairs = [];
    for (const [key, count] of Object.entries(raw)) {
        let parts = key.split('_confused_with_');
        if (parts.length !== 2) parts = key.split('_vs_');
        if (parts.length !== 2) continue;
        pairs.push({ correct: norm(parts[0]), wrong: norm(parts[1]), count: Number(count) || 0 });
    }
    return pairs;
}

// Total times the child answered `item` wrongly in this mode (as the target).
export function mistakeCount(modeName, item) {
    const target = norm(item);
    return parseMistakes(modeName)
        .filter(p => p.correct === target)
        .reduce((sum, p) => sum + p.count, 0);
}

// Items the child has confused with `item` in this mode, most frequent first,
// followed by the seeded confusable partners (letters) so a brand-new profile
// still gets meaningful distractors.
export function confusablesFor(modeName, item, { seeded = CONFUSABLE_LETTERS } = {}) {
    const target = norm(item);
    const fromHistory = parseMistakes(modeName)
        .filter(p => p.correct === target || p.wrong === target)
        .map(p => ({ other: p.correct === target ? p.wrong : p.correct, count: p.count }));
    const totals = new Map();
    for (const { other, count } of fromHistory) totals.set(other, (totals.get(other) || 0) + count);
    const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([other]) => other);
    for (const [a, b] of seeded) {
        if (a === target && !ordered.includes(b)) ordered.push(b);
        if (b === target && !ordered.includes(a)) ordered.push(a);
    }
    return ordered;
}

// Weight for picking `item` as the next target.
export function itemWeight(modeName, item, { seedList = [] } = {}) {
    let weight = 1;
    weight += MISTAKE_WEIGHT * mistakeCount(modeName, item);
    if (seedList.some(s => norm(s) === norm(item))) weight += SEED_WEIGHT;
    return Math.min(MAX_WEIGHT, weight);
}

export function weightedPick(items, weightFn, random = Math.random) {
    if (!items || items.length === 0) return undefined;
    const weights = items.map(item => Math.max(0, weightFn(item)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return items[Math.floor(random() * items.length)];
    let roll = random() * total;
    for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll < 0) return items[i];
    }
    return items[items.length - 1];
}

// Pick the next target from `items`, favouring mistakes and seeded hard items.
export function pickAdaptive(modeName, items, { seedList = [], random = Math.random } = {}) {
    const weights = new Map(items.map(item => [item, itemWeight(modeName, item, { seedList })]));
    return weightedPick(items, item => weights.get(item), random);
}

// Choose `count` distractors for `correct` from `pool`: confusable partners
// first (from history, then seeded), then random fillers. Never includes the
// correct item, never repeats. Returns items in the pool's own type (so a
// numeric pool yields numbers).
export function pickDistractors(modeName, correct, pool, count, { seeded = CONFUSABLE_LETTERS, random = Math.random, maxConfusables = 2 } = {}) {
    const target = norm(correct);
    const candidates = pool.filter(item => norm(item) !== target);
    const byNorm = new Map(candidates.map(item => [norm(item), item]));
    const chosen = [];

    for (const other of confusablesFor(modeName, correct, { seeded })) {
        if (chosen.length >= Math.min(count, maxConfusables)) break;
        const item = byNorm.get(other);
        if (item !== undefined && !chosen.includes(item)) chosen.push(item);
    }

    const rest = candidates.filter(item => !chosen.includes(item));
    // Fisher-Yates on a copy
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    while (chosen.length < count && rest.length > 0) chosen.push(rest.shift());

    // Shuffle so the confusable isn't always in the same slot
    for (let i = chosen.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    }
    return chosen;
}
