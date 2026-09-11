import { describe, it, expect, beforeEach } from 'vitest';
import { trackWrongAnswer } from '../src/wrongAnswers.js';
import {
    parseMistakes, mistakeCount, confusablesFor, itemWeight, weightedPick,
    pickAdaptive, pickDistractors, HARD_LETTERS, HARD_NUMBERS
} from '../src/adaptive.js';
import { parseNumberRange } from '../src/utils/parseNumberRange.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

describe('adaptive item selection', () => {
    beforeEach(() => localStorage.clear());

    it('parses both mistake key formats', () => {
        trackWrongAnswer('LetterListeningMode', 'b', 'd');
        trackWrongAnswer('LetterListeningMode', 'b', 'd');
        trackWrongAnswer('NumberListeningMode', 14, 40);
        expect(parseMistakes('LetterListeningMode')).toEqual([{ correct: 'B', wrong: 'D', count: 2 }]);
        expect(parseMistakes('NumberListeningMode')).toEqual([{ correct: '14', wrong: '40', count: 1 }]);
        expect(mistakeCount('LetterListeningMode', 'B')).toBe(2);
        expect(mistakeCount('LetterListeningMode', 'x')).toBe(0);
    });

    it('weights missed and seeded items higher, with a ceiling', () => {
        expect(itemWeight('LetterListeningMode', 'C')).toBe(1);
        expect(itemWeight('LetterListeningMode', 'D', { seedList: HARD_LETTERS })).toBe(2.5);
        for (let i = 0; i < 20; i++) trackWrongAnswer('LetterListeningMode', 'D', 'B');
        expect(itemWeight('LetterListeningMode', 'D', { seedList: HARD_LETTERS })).toBe(8);
        expect(itemWeight('NumberListeningMode', 14, { seedList: HARD_NUMBERS })).toBe(2.5);
    });

    it('weightedPick follows the weights and never returns a zero-weight item', () => {
        const items = ['x', 'y', 'z'];
        const w = { x: 0, y: 1, z: 3 };
        const counts = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < 400; i++) counts[weightedPick(items, it => w[it], () => i / 400)]++;
        expect(counts).toEqual({ x: 0, y: 100, z: 300 });
    });

    it('pickAdaptive prefers the letters the child gets wrong', () => {
        for (let i = 0; i < 5; i++) trackWrongAnswer('LetterListeningMode', 'G', 'N');
        let g = 0;
        const N = 2000;
        for (let i = 0; i < N; i++) if (pickAdaptive('LetterListeningMode', LETTERS) === 'G') g++;
        // Uniform would be ~1/29 = 3.4%; with weight 8 vs 1 it should be ~22%
        expect(g / N).toBeGreaterThan(0.12);
    });

    it('confusablesFor combines history and seeded pairs, most frequent first', () => {
        trackWrongAnswer('LetterListeningMode', 'b', 'p');
        trackWrongAnswer('LetterListeningMode', 'b', 'p');
        trackWrongAnswer('LetterListeningMode', 'd', 'b'); // reverse direction counts too
        const c = confusablesFor('LetterListeningMode', 'B');
        expect(c.slice(0, 2)).toEqual(['P', 'D']);
        expect(c).toContain('D');
        expect(confusablesFor('LetterListeningMode', 'Q')).toEqual(expect.arrayContaining(['P', 'O']));
    });

    it('pickDistractors always includes a confusable partner when available', () => {
        for (let i = 0; i < 50; i++) {
            const d = pickDistractors('LetterListeningMode', 'D', LETTERS, 5);
            expect(d).toHaveLength(5);
            expect(d).not.toContain('D');
            expect(new Set(d).size).toBe(5);
            expect(d).toContain('B');
        }
        // Numbers keep their type and don't crash without seeded partners
        const nums = pickDistractors('NumberListeningMode', 14, [10, 11, 12, 13, 14, 15, 40], 3);
        expect(nums).toHaveLength(3);
        expect(nums.every(n => typeof n === 'number' && n !== 14)).toBe(true);
        expect(pickDistractors('X', 'a', ['a'], 3)).toEqual([]);
    });
});

describe('parseNumberRange', () => {
    it('parses lists and ranges, skips junk, dedupes and sorts', () => {
        expect(parseNumberRange('12-15, 30, 3, junk, -5, 13')).toEqual([3, 12, 13, 14, 15, 30]);
        expect(parseNumberRange('', [1, 2])).toEqual([1, 2]);
        expect(parseNumberRange(undefined, [7])).toEqual([7]);
        expect(parseNumberRange('9-1', [0])).toEqual([0]);
        expect(parseNumberRange(42)).toEqual([42]);
    });
});
