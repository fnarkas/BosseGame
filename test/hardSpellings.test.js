import { describe, it, expect } from 'vitest';
import { parseClusterRules, findHardSpans, hardIndices, markHardParts, DEFAULT_HARD_CLUSTERS } from '../src/hardSpellings.js';
import { SPELLING_WORDS } from '../src/spellingWords.js';

describe('hard spellings', () => {
    it('marks the sj/tj/j sounds, ck and ng with the default rules', () => {
        const expected = {
            'många': 'må[ng]a', 'tack': 'ta[ck]', 'gick': '[g]i[ck]', 'kanske': 'kan[sk]e',
            'kille': '[k]ille', 'gör': '[g]ör', 'lugnt': 'lu[gn]t', 'stjärna': '[stj]ärna',
            'skjuta': '[skj]uta', 'tjej': '[tj]ej', 'hjälp': '[hj]älp', 'sex': 'se[x]',
            'ingenting': 'i[ng]enti[ng]'
        };
        for (const [word, marked] of Object.entries(expected)) expect(markHardParts(word)).toBe(marked);
    });

    it('leaves hard-k, hard-g and sk before a hard vowel alone', () => {
        for (const word of ['skulle', 'ska', 'skolan', 'kommer', 'kanin', 'gå', 'gammal', 'älska', 'hund', 'tänker']) {
            expect(markHardParts(word), word).toBe(word);
        }
        // k before a soft vowel is only the tj-sound at the start of the word
        expect(markHardParts('tänker')).toBe('tänker');
        expect(markHardParts('kär')).toBe('[k]är');
    });

    it('prefers the longest rule and never overlaps spans', () => {
        expect(findHardSpans('stjärna').map(s => s.rule)).toEqual(['stj']);
        expect(findHardSpans('skjorta').map(s => s.rule)).toEqual(['skj']);
        const spans = findHardSpans('ingenting');
        expect(spans).toEqual([{ start: 1, end: 3, rule: 'ng' }, { start: 7, end: 9, rule: 'ng' }]);
        expect([...hardIndices('ingenting')]).toEqual([1, 2, 7, 8]);
    });

    it('parses admin rule text: anchors, soft-vowel stars, doubles, junk', () => {
        const rules = parseClusterRules(' ck , ^k*, dubbel, ??, sk* ,,');
        expect(rules.map(r => r.kind)).toEqual(['cluster', 'cluster', 'cluster', 'double']);
        expect(rules.find(r => r.letters === 'k')).toMatchObject({ atStart: true, softVowel: true });
        expect(markHardParts('boll', ['dubbel'])).toBe('bol[l]');
        expect(markHardParts('katt', 'ck,dubbel')).toBe('kat[t]');
        expect(markHardParts('kanske', [])).toBe('kanske');
        expect(hardIndices('tack', '').size).toBe(0);
    });

    it('marks a sensible share of the real word pool and every marked span is inside the word', () => {
        let marked = 0;
        for (const word of SPELLING_WORDS) {
            const spans = findHardSpans(word, DEFAULT_HARD_CLUSTERS);
            if (spans.length) marked++;
            for (const { start, end } of spans) {
                expect(start).toBeGreaterThanOrEqual(0);
                expect(end).toBeLessThanOrEqual(word.length);
                expect(end).toBeGreaterThan(start);
            }
        }
        expect(marked).toBeGreaterThan(30);
        expect(marked).toBeLessThan(SPELLING_WORDS.length / 4);
    });
});
