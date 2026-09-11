import { describe, it, expect } from 'vitest';
import { readDefaultConfig } from '../helpers/setup.js';
import { renderAdminPage } from '../../src/admin/index.js';
import { MINIGAME_CONFIG_SCHEMA } from '../../src/admin/schema.js';
import { MINIGAMES } from '../../src/minigameRegistry.js';
import { getAvailablePokemon } from '../../src/pokemonData.js';

// The page is rendered as one HTML string before any DOM exists, so the
// markup can be checked in Node.
describe('admin page markup', () => {
    const page = renderAdminPage(readDefaultConfig(), { text: 'hello <b>', color: '#4CAF50' });

    it('renders without leaking objects or undefined values', () => {
        expect(page).not.toContain('[object Object]');
        expect(page).not.toContain('undefined');
        expect(page).not.toContain('NaN');
        expect(page).toContain('hello &lt;b&gt;');
    });

    it('has an input for every schema field, a weight input per minigame and a card per Pokemon', () => {
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            expect(page).toContain(`id="config-panel-${section.id}"`);
            expect(page).toContain(`data-save="${section.id}"`);
            for (const field of section.fields) expect(page).toContain(`id="config-field-${field.id}"`);
        }
        for (const game of MINIGAMES) expect(page).toContain(`id="weight-${game.key}"`);
        const cards = page.match(/data-pokemon-card="/g) || [];
        expect(cards).toHaveLength(getAvailablePokemon().length);
        expect(page).toContain('loading="lazy"');
    });

    it('reflects config values in the inputs', () => {
        const config = readDefaultConfig();
        expect(page).toContain(`value="${config.numbers.numbers}"`);
        expect(page).toMatch(new RegExp(`id="weight-numberBonds"[^>]*value="${config.weights.numberBonds}"`));
        expect(page).toMatch(/<option value="lowercase" selected>lowercase<\/option>/);
    });
});
