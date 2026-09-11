import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getJSON } from '../../src/storage.js';
import { installFakeScene, flush } from '../helpers/fakeScene.js';
import { MainGameScene } from '../../src/scenes/MainGameScene.js';
import { addPokeball, getInventory } from '../../src/inventory.js';
import { addCoins, getCoinCount } from '../../src/currency.js';

async function makeScene({ caught = [], balls = 5, coins = 0, currentPokemon = null } = {}) {
    for (let i = 0; i < balls; i++) addPokeball('pokeball');
    if (coins) addCoins(coins);
    const scene = new MainGameScene();
    const fake = installFakeScene(scene, {
        registry: { answerMode: 'letter', caughtPokemon: caught, currentPokemon }
    });
    window.showPokedex = () => {};
    window.openStore = () => {};
    window.showPokemonCaughtPopup = vi.fn((id, done) => done());
    scene.create();
    await flush();
    return { scene, fake };
}

const letterButton = (fake, letter) =>
    fake.interactives().find(o => o.type === 'Rectangle' && o.getData('letter') === letter);
const hearts = (fake) => fake.findText(t => t.text.includes('❤️') || t.text.includes('🖤'));
const nameLetters = (fake) => fake.liveTexts().filter(t => t.getData('pokemonNameLetter'));
const rerollCosts = (fake) => fake.findTexts(t => t.text === '5' && t.getData('clearOnNewEncounter'));
const shownName = (fake) => nameLetters(fake).map(t => t.text).join('').toLowerCase();

async function spellName(scene, fake) {
    const name = scene.currentPokemon.name.toUpperCase();
    for (const ch of name) {
        if (!/[A-ZÅÄÖ]/.test(ch)) continue;
        fake.click(letterButton(fake, ch));
        fake.advance(700);
        await flush();
    }
}

describe('MainGameScene (Pokemon catching)', () => {
    afterEach(() => {
        delete window.showPokedex;
        delete window.openStore;
        delete window.showPokemonCaughtPopup;
        vi.restoreAllMocks();
    });

    it('starts with the first tutorial Pokemon, full hearts and a whole keyboard', async () => {
        const { scene, fake } = await makeScene();
        expect(scene.currentPokemon.id).toBe(95); // Onix
        expect(scene.isTutorialCatch).toBe(true);
        expect(hearts(fake).text).toBe('❤️❤️❤️');
        expect(fake.interactives().filter(o => o.getData('letter'))).toHaveLength(29);
        expect(shownName(fake)).toBe('onix');
    });

    it('catches the Pokemon after spelling its name and moves to the next encounter', async () => {
        const { scene, fake } = await makeScene();
        await spellName(scene, fake);
        // Pokemon name audio, then the pokeball selector
        fake.advance(1000);
        expect(fake.playedAudio()).toContain('pokemon_audio_95');
        const ball = fake.interactives().find(o => o.type === 'Image' && o.textureKey === 'pokeball_poke-ball');
        expect(ball).toBeTruthy();
        fake.click(ball);
        expect(getInventory().pokeball).toBe(4);
        fake.advance(8000);
        await flush();
        expect(window.showPokemonCaughtPopup).toHaveBeenCalledWith(95, expect.any(Function));
        expect(getJSON('pokemonCaughtList').map(p => p.id)).toEqual([95]);
        // Next tutorial Pokemon is up, with fresh hearts and exactly one re-roll price tag
        expect(scene.currentPokemon.id).toBe(41);
        expect(hearts(fake).text).toBe('❤️❤️❤️');
        expect(rerollCosts(fake)).toHaveLength(1);
        expect(scene.isAnimating).toBe(false);
    });

    it('loses one life per wrong letter and the Pokemon runs away on the third', async () => {
        const { scene, fake } = await makeScene();
        const wrong = ['A', 'B', 'C'];
        for (let i = 0; i < 3; i++) {
            fake.click(letterButton(fake, wrong[i]));
            fake.advance(600);
            await flush();
            if (i < 2) {
                expect(hearts(fake).text).toBe('❤️'.repeat(2 - i) + '🖤'.repeat(i + 1));
                // Wrong letters are greyed out and dead
                expect(letterButton(fake, wrong[i])).toBeUndefined();
            }
        }
        expect(scene.isAnimating).toBe(true);
        fake.advance(3000);
        await flush();
        // New encounter after the run-away: still the tutorial Pokemon, full hearts
        expect(scene.isAnimating).toBe(false);
        expect(hearts(fake).text).toBe('❤️❤️❤️');
        expect(letterButton(fake, 'A')).toBeTruthy();
    });

    it('does not lose a life on a quick double tap of the right letter', async () => {
        const { scene, fake } = await makeScene();
        const o = letterButton(fake, 'O');
        fake.click(o);
        fake.click(o);
        fake.advance(700);
        await flush();
        expect(scene.attemptsLeft).toBe(3);
        expect(hearts(fake).text).toBe('❤️❤️❤️');
        expect(scene.answerMode.currentLetter).toBe('N');
    });

    it('re-rolls for five coins and leaves no stale UI behind', async () => {
        const { scene, fake } = await makeScene({ coins: 20, caught: [{ id: 1 }, { id: 2 }, { id: 3 }] });
        const first = scene.currentPokemon.id;
        for (let i = 0; i < 3; i++) {
            fake.click(fake.findText('🎲'));
            await flush();
        }
        expect(getCoinCount()).toBe(5);
        expect(rerollCosts(fake)).toHaveLength(1);
        expect(fake.liveTexts().filter(t => t.text === '🎲')).toHaveLength(1);
        expect(shownName(fake)).toBe(scene.currentPokemon.name.toLowerCase());
        // A 4th re-roll spends the last coins; a 5th is refused without coins
        fake.click(fake.findText('🎲'));
        await flush();
        expect(getCoinCount()).toBe(0);
        const current = scene.currentPokemon.id;
        fake.click(fake.findText('🎲'));
        expect(scene.currentPokemon.id).toBe(current);
        expect(first).toBeDefined();
    });

    it('a pending letter refresh cannot redraw the old name after a re-roll', async () => {
        const { scene, fake } = await makeScene({ coins: 5, caught: [{ id: 1 }, { id: 2 }, { id: 3 }] });
        const firstLetter = scene.currentPokemon.name.toUpperCase()[0];
        fake.click(letterButton(fake, firstLetter));
        fake.click(fake.findText('🎲')); // re-roll while the 600ms refresh is pending
        await flush();
        fake.advance(2000);
        await flush();
        expect(shownName(fake)).toBe(scene.currentPokemon.name.toLowerCase());
        expect(fake.interactives().filter(o => o.getData('letter')).length).toBeLessThanOrEqual(29);
    });

    it('after a Pokemon breaks free the hearts are full and lives are lost again normally', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999); // every catch roll fails
        const caught = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const { scene, fake } = await makeScene({ caught });
        expect(scene.isTutorialCatch).toBe(false);
        await spellName(scene, fake);
        fake.advance(1000);
        fake.click(fake.interactives().find(o => o.type === 'Image' && o.textureKey === 'pokeball_poke-ball'));
        fake.advance(10000);
        await flush();
        expect(scene.isAnimating).toBe(false);
        expect(scene.attemptsLeft).toBe(3);
        expect(hearts(fake).text).toBe('❤️❤️❤️');
        // Same Pokemon, fresh challenge; a wrong letter now costs a life
        const wrongLetter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('')
            .find(l => !scene.currentPokemon.name.toUpperCase().includes(l));
        fake.click(letterButton(fake, wrongLetter));
        fake.advance(600);
        await flush();
        expect(scene.attemptsLeft).toBe(2);
        expect(hearts(fake).text).toBe('❤️❤️🖤');
    });

    it('keeps the tutorial guarantee when the Pokemon is restored from the registry', async () => {
        const { scene } = await makeScene({ currentPokemon: { id: 95, name: 'Onix' } });
        expect(scene.isTutorialCatch).toBe(true);
    });

    it('shows the no-pokeballs popup instead of an encounter when the bag is empty', async () => {
        const { scene, fake } = await makeScene({ balls: 0 });
        expect(scene.noPokeballsPopupElements.length).toBeGreaterThan(0);
        expect(fake.findText('⚠️')).toBeTruthy();
        addPokeball('pokeball');
        scene.onOverlayClosed(); // e.g. the store was just closed
        await flush();
        expect(scene.noPokeballsPopupElements).toBeNull();
        expect(scene.currentPokemon).toBeTruthy();
    });
});
