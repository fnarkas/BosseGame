import { describe, it, expect } from 'vitest';
import { countCaughtAvailable, normalizeCaughtEntry, matchesPokedexQuery } from '../../src/admin/sections/pokemon.js';
import { tabFromHash, DEFAULT_TAB } from '../../src/admin/index.js';
import { groupWordsByLetter, textCaseFromConfig } from '../../src/admin/sections/emojiWords.js';
import { weightPercentages, currentWeights } from '../../src/admin/sections/weights.js';
import { MINIGAMES } from '../../src/minigameRegistry.js';
import { DEFAULT_MODE_WEIGHTS } from '../../src/minigameWheel.js';
import { escapeHtml, html, toHtml, raw } from '../../src/admin/html.js';

describe('admin pokemon sync', () => {
    it('normalizes legacy plain ids to entries', () => {
        expect(normalizeCaughtEntry(25, () => 'now')).toEqual({ id: 25, name: 'Pikachu', caughtDate: 'now' });
        expect(normalizeCaughtEntry({ id: 1, name: 'Bulbasaur', caughtDate: 'x' })).toEqual({ id: 1, name: 'Bulbasaur', caughtDate: 'x' });
        expect(normalizeCaughtEntry({ junk: true })).toBeNull();
        expect(normalizeCaughtEntry(null)).toBeNull();
    });

    it('counts only available (Gen 1) Pokemon', () => {
        expect(countCaughtAvailable([1, { id: 151 }, { id: 152 }, 9999])).toBe(2);
    });

    it('filters cards by name, number and caught state', () => {
        const pikachu = { id: 25, name: 'Pikachu' };
        expect(matchesPokedexQuery(pikachu, true, '', 'all')).toBe(true);
        expect(matchesPokedexQuery(pikachu, true, 'PIKA', 'all')).toBe(true);
        expect(matchesPokedexQuery(pikachu, true, 'chu', 'all')).toBe(true);
        expect(matchesPokedexQuery(pikachu, true, 'bulba', 'all')).toBe(false);
        expect(matchesPokedexQuery(pikachu, true, '#25', 'all')).toBe(true);
        expect(matchesPokedexQuery(pikachu, true, '2', 'all')).toBe(true);
        expect(matchesPokedexQuery(pikachu, true, '5', 'all')).toBe(false);
        expect(matchesPokedexQuery(pikachu, true, '', 'caught')).toBe(true);
        expect(matchesPokedexQuery(pikachu, false, '', 'caught')).toBe(false);
        expect(matchesPokedexQuery(pikachu, false, '', 'missing')).toBe(true);
        expect(matchesPokedexQuery(pikachu, true, 'pika', 'missing')).toBe(false);
    });
});

describe('admin tabs', () => {
    it('reads the tab from the hash and falls back to the first one', () => {
        expect(tabFromHash('#pokedex')).toBe('pokedex');
        expect(tabFromHash('weights')).toBe('weights');
        expect(tabFromHash('#nope')).toBe(DEFAULT_TAB);
        expect(tabFromHash('')).toBe(DEFAULT_TAB);
        expect(tabFromHash(undefined)).toBe(DEFAULT_TAB);
    });
});

describe('admin emoji words data', () => {
    it('groups words by letter in sorted order', () => {
        const groups = groupWordsByLetter([
            { id: 1, word: 'BIL', emoji: '🚗', letter: 'B' },
            { id: 2, word: 'APA', emoji: '🐵', letter: 'A' },
            { id: 3, word: 'BOK', emoji: '📖', letter: 'B' }
        ]);
        expect(groups.map(g => g.letter)).toEqual(['A', 'B']);
        expect(groups[1].words.map(w => w.word)).toEqual(['BIL', 'BOK']);
    });

    it('falls back to uppercase for an unknown text case', () => {
        expect(textCaseFromConfig({ emojiWord: { textCase: 'lowercase' } })).toBe('lowercase');
        expect(textCaseFromConfig({ emojiWord: { textCase: 'weird' } })).toBe('uppercase');
        expect(textCaseFromConfig({})).toBe('uppercase');
    });
});

describe('admin weights data', () => {
    it('merges stored weights over the registry defaults', () => {
        expect(currentWeights({})).toEqual(DEFAULT_MODE_WEIGHTS);
        const merged = currentWeights({ weights: { wordSpelling: '5', addition: -1, bogus: 3 } });
        expect(merged.wordSpelling).toBe(5);
        expect(merged.addition).toBe(DEFAULT_MODE_WEIGHTS.addition);
        expect(merged.bogus).toBeUndefined();
    });

    it('turns weights into percentages, one row per registry entry', () => {
        const zero = Object.fromEntries(MINIGAMES.map(g => [g.key, 0]));
        const rows = weightPercentages({ ...zero, addition: 3, wordSpelling: 1 });
        expect(rows).toHaveLength(MINIGAMES.length);
        expect(rows.find(r => r.key === 'addition').percent).toBe(75);
        expect(rows.find(r => r.key === 'wordSpelling').percent).toBe(25);
        // All zero: equal split, so the chart is never empty.
        const equal = weightPercentages(zero);
        expect(new Set(equal.map(r => r.percent)).size).toBe(1);
    });
});

describe('admin html helpers', () => {
    it('escapes interpolations unless marked raw', () => {
        expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
        expect(toHtml(html`<b>${'<i>'}</b>${raw('<u>')}${['a', '<']}${null}${false}`)).toBe('<b>&lt;i&gt;</b><u>a&lt;');
    });
});
