import { describe, it, expect } from 'vitest';
import { readDefaultConfig } from '../helpers/setup.js';
import { renderAdminPage } from '../../src/admin/index.js';
import { MINIGAME_CONFIG_SCHEMA } from '../../src/admin/schema.js';
import { MINIGAMES } from '../../src/minigameRegistry.js';
import { getAvailablePokemon } from '../../src/pokemonPool.js';
import { INVENTORY_ITEMS } from '../../src/admin/sections/inventory.js';
import { ADMIN_TABS } from '../../src/admin/index.js';

// The page is rendered as one HTML string before any DOM exists, so the
// markup can be checked in Node.
describe('admin page markup', () => {
    const accounts = [{ name: 'Olle', pokemonCount: 3 }, { name: 'A <b>', pokemonCount: 0 }];
    const page = renderAdminPage(readDefaultConfig(), {
        accounts, selected: 'Olle', banner: { text: 'hello <b>', color: '#4CAF50' }
    });

    it('renders without leaking objects or undefined values', () => {
        expect(page).not.toContain('[object Object]');
        expect(page).not.toContain('undefined');
        expect(page).not.toContain('NaN');
        expect(page).toContain('hello &lt;b&gt;');
    });

    it('lists every account in the picker with the current one selected, escaped', () => {
        expect(page).toContain('<option value="Olle" selected>Olle (📖 3)</option>');
        expect(page).toContain('<option value="A &lt;b&gt;" >A &lt;b&gt; (📖 0)</option>');
    });

    it('shows no sections until an account is selected', () => {
        const empty = renderAdminPage({}, { accounts: [], selected: null, banner: { text: 'none', color: '#000' } });
        expect(empty).toContain('none');
        expect(empty).not.toContain('id="admin-weights"');
        expect(empty).not.toContain('id="admin-account"');
        expect(empty).not.toContain('id="admin-tabs"');
    });

    it('renders one tab and one panel per section, the requested tab open', () => {
        for (const tab of ADMIN_TABS) {
            expect(page).toContain(`data-tab="${tab.id}"`);
            expect(page).toContain(`data-panel="${tab.id}"`);
            expect(page).toContain(`id="${tab.section}"`);
        }
        expect(page).toMatch(/data-panel="inventory" >/);
        expect(page).toMatch(/data-panel="pokedex" hidden>/);
        const other = renderAdminPage(readDefaultConfig(), { accounts, selected: 'Olle', tab: 'pokedex' });
        expect(other).toMatch(/data-panel="pokedex" >/);
        expect(other).toMatch(/data-panel="inventory" hidden>/);
        const bogus = renderAdminPage(readDefaultConfig(), { accounts, selected: 'Olle', tab: 'nope' });
        expect(bogus).toMatch(/data-panel="inventory" >/);
    });

    it('has a stepper input per inventory item showing the stored value', () => {
        for (const item of INVENTORY_ITEMS) expect(page).toContain(`data-inv-input="${item.id}"`);
        expect(page).toMatch(/data-inv-input="coins"\s+value="0"/);
        expect(page).toContain('pokeball_sprites/poke-ball.png');
        expect(page).toContain('id="admin-sync"');
        expect(page).toContain('All changes saved');
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
