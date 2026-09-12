import { describe, it, expect } from 'vitest';
import { readDefaultConfig } from '../helpers/setup.js';
import {
    MINIGAME_CONFIG_SCHEMA, fieldKey, sectionDefaults, readSectionValues, serializeSection,
    validateSection, sectionPatch, getSection, lettersPreview, numbersPreview, legendaryNumbersPreview,
    pokemonCatchingPreview
} from '../../src/admin/schema.js';

const config = readDefaultConfig();
const EXPECTED_SECTIONS = [
    'letters', 'numbers', 'pokemonCatching', 'legendary', 'legendaryNumbers', 'wordSpelling', 'dayMatch',
    'addition', 'multiplication', 'numberBonds', 'vowelLength', 'vowelSort', 'vowelSounds', 'pianoLearning', 'speedReading'
];

describe('admin schema', () => {
    it('describes the 15 minigame panels', () => {
        expect(MINIGAME_CONFIG_SCHEMA.map(s => s.key)).toEqual(EXPECTED_SECTIONS);
    });

    it('every section key exists in public/config/minigames.json', () => {
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            expect(config, section.key).toHaveProperty(section.key);
        }
    });

    it('writes exactly the keys the config file holds for each section', () => {
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            const written = Object.keys(serializeSection(section, sectionDefaults(section))).sort();
            const stored = Object.keys(config[section.key]).sort();
            expect(written, section.key).toEqual(stored);
        }
    });

    it('has unique section ids, unique field ids, and unique keys within a section', () => {
        const ids = MINIGAME_CONFIG_SCHEMA.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        const fieldIds = MINIGAME_CONFIG_SCHEMA.flatMap(s => s.fields.map(f => f.id));
        expect(new Set(fieldIds).size).toBe(fieldIds.length);
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            const keys = section.fields.map(fieldKey);
            expect(new Set(keys).size, section.key).toBe(keys.length);
            for (const field of section.fields) {
                expect(['text', 'number', 'checkbox', 'select'], `${section.key}.${field.id}`).toContain(field.type);
                expect(field.default, `${section.key}.${field.id} default`).not.toBeUndefined();
                expect(typeof field.label).toBe('string');
                if (field.type === 'select') {
                    expect(field.options.map(o => o.value)).toContain(field.default);
                }
                if (field.type === 'number') {
                    expect(field.default).toBeGreaterThanOrEqual(field.min);
                    expect(field.default).toBeLessThanOrEqual(field.max);
                }
            }
        }
    });

    it('defaults round-trip through the generic serializer', () => {
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            const defaults = sectionDefaults(section);
            const stored = serializeSection(section, defaults);
            expect(readSectionValues(section, { [section.key]: stored }), section.key).toEqual(defaults);
            // A missing section yields the defaults too.
            expect(readSectionValues(section, {}), section.key).toEqual(defaults);
            expect(validateSection(section, defaults), section.key).toBeNull();
            expect(sectionPatch(section, defaults)).toEqual({ [section.key]: stored });
        }
    });

    it('the checked-in config round-trips unchanged', () => {
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            const values = readSectionValues(section, config);
            expect(serializeSection(section, values), section.key).toEqual(config[section.key]);
        }
    });

    it('coerces form strings and falls back to defaults for garbage', () => {
        const addition = getSection('addition');
        const stored = serializeSection(addition, { numberOfTerms: '3', maxSum: 'abc', onlyOneMultiDigit: 0 });
        expect(stored).toEqual({ numberOfTerms: 3, maxSum: 99, onlyOneMultiDigit: false });
        expect(readSectionValues(addition, { addition: { numberOfTerms: 'x', onlyOneMultiDigit: 'false' } }))
            .toEqual({ numberOfTerms: 2, maxSum: 99, onlyOneMultiDigit: false });
        const sounds = getSection('vowelSounds');
        expect(readSectionValues(sounds, { vowelSounds: { stage: 'bogus' } }).stage).toBe('sounds');
    });

    it('multiplication always writes the fixed product cap', () => {
        const section = getSection('multiplication');
        expect(serializeSection(section, sectionDefaults(section)).maxProduct).toBe(99);
    });

    it('previews validate letter and number ranges', () => {
        expect(lettersPreview('a-c,Ä').error).toBeNull();
        expect(lettersPreview('a-c,Ä').html).toContain('4 letters');
        expect(lettersPreview('abc').error).toMatch(/Invalid/);
        expect(lettersPreview('').error).toMatch(/Invalid/);

        expect(numbersPreview('1,3-5').html).toContain('4 numbers');
        expect(numbersPreview('junk').error).toMatch(/Invalid/);

        expect(legendaryNumbersPreview('0-9').html).toContain('10 active numbers (90 inactive)');
        expect(legendaryNumbersPreview('90-120').error).toMatch(/between 0 and 99/);

        const letters = getSection('letters');
        expect(validateSection(letters, { letters: 'abc' })).toEqual({ fieldId: 'letters', error: expect.stringMatching(/Invalid/) });
    });

    it('escapes user text in previews', () => {
        expect(lettersPreview('<').html).toContain('&lt;');
        expect(lettersPreview('<').html).not.toContain('<span class="admin-chip admin-chip-letter"><<');
    });

    it('pokemon catching preview follows the selected cases', () => {
        expect(pokemonCatchingPreview({ nameCase: 'uppercase', alphabetCase: 'lowercase' })).toMatch(/PIKACHU[\s\S]*a b c d e/);
        expect(pokemonCatchingPreview({ nameCase: 'lowercase', alphabetCase: 'uppercase' })).toMatch(/pikachu[\s\S]*A B C D E/);
    });
});
