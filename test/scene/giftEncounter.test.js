import { describe, it, expect, afterEach, vi } from 'vitest';
import { installFakeScene, flush } from '../helpers/fakeScene.js';
import { MainGameScene } from '../../src/scenes/MainGameScene.js';
import { addPokeball, getInventory } from '../../src/inventory.js';
import { getCoinCount } from '../../src/currency.js';
import { queueGift, getSpawnQueue } from '../../src/spawnQueue.js';

async function makeScene({ balls = 5, gift = null, registry = {} } = {}) {
    for (let i = 0; i < balls; i++) addPokeball('pokeball');
    if (gift) queueGift(gift);
    const scene = new MainGameScene();
    const fake = installFakeScene(scene, {
        registry: { answerMode: 'letter', caughtPokemon: [], ...registry }
    });
    window.showPokedex = () => {};
    window.openStore = () => {};
    window.showPokemonCaughtPopup = vi.fn((id, done) => done());
    scene.create();
    await flush();
    return { scene, fake };
}

const giftBox = (fake) => fake.interactives().find(o => o.type === 'Text' && o.getData('giftBox'));
const rerollButtons = (fake) => fake.findTexts(t => t.text === '🎲');

describe('MainGameScene presents', () => {
    afterEach(() => {
        delete window.showPokedex;
        delete window.openStore;
        delete window.showPokemonCaughtPopup;
        vi.restoreAllMocks();
    });

    it('shows a gift box instead of a Pokemon when a present is next, without the catching UI', async () => {
        const { scene, fake } = await makeScene({ gift: { coins: 10, pokeball: 2 } });
        expect(scene.currentGift).toEqual({ coins: 10, pokeball: 2 });
        expect(scene.currentPokemon).toBeNull();
        expect(scene.registry.get('currentGift')).toEqual({ coins: 10, pokeball: 2 });
        expect(scene.registry.get('currentPokemon')).toBeUndefined();
        expect(giftBox(fake)).toBeTruthy();
        expect(rerollButtons(fake)).toHaveLength(0);
        expect(fake.interactives().filter(o => o.getData('letter'))).toHaveLength(0);
        // The present left the queue the moment it was shown.
        expect(getSpawnQueue().some(entry => entry.gift)).toBe(false);
    });

    it('opening the box grants the contents, updates the HUD and moves on to a Pokemon', async () => {
        const { scene, fake } = await makeScene({ gift: { coins: 10, pokeball: 2, legendaryball: 1 } });
        expect(getCoinCount()).toBe(0);
        fake.click(giftBox(fake));
        fake.advance(1500);
        await flush();
        expect(getCoinCount()).toBe(10);
        expect(getInventory()).toMatchObject({ pokeball: 7, legendaryball: 1 });
        expect(scene.inventoryHUD.coinText.text).toBe('10');
        expect(scene.inventoryHUD.pokeballTexts.pokeball.text).toBe('7');
        expect(scene.registry.get('currentGift')).toBeUndefined();
        // Reveal shows one "+count" per item
        expect(fake.findTexts(t => /^\+\d+$/.test(t.text)).map(t => t.text)).toEqual(['+10', '+2', '+1']);

        fake.advance(5000);
        await flush();
        expect(scene.currentPokemon.id).toBe(95);
        expect(scene.isAnimating).toBe(false);
        expect(giftBox(fake)).toBeUndefined();
        expect(fake.findTexts(t => /^\+\d+$/.test(t.text))).toHaveLength(0);
    });

    it('a second tap while the box is opening does nothing extra', async () => {
        const { fake } = await makeScene({ gift: { coins: 3 } });
        const box = giftBox(fake);
        fake.click(box);
        fake.click(box);
        fake.advance(1500);
        await flush();
        expect(getCoinCount()).toBe(3);
    });

    it('can be opened with an empty bag, instead of the no-pokeballs popup', async () => {
        const { scene, fake } = await makeScene({ balls: 0, gift: { greatball: 2 } });
        expect(scene.noPokeballsPopupElements || []).toHaveLength(0);
        expect(giftBox(fake)).toBeTruthy();
        fake.click(giftBox(fake));
        fake.advance(8000);
        await flush();
        expect(getInventory().greatball).toBe(2);
        expect(scene.currentPokemon).toBeTruthy();
    });

    it('lifts the no-pokeballs popup when a present is queued meanwhile', async () => {
        const { scene, fake } = await makeScene({ balls: 0 });
        expect(scene.noPokeballsPopupElements.length).toBeGreaterThan(0);
        queueGift({ pokeball: 1 });
        scene.onRemoteChange(['pokemonSpawnQueue']);
        await flush();
        expect(scene.noPokeballsPopupElements).toBeNull();
        expect(giftBox(fake)).toBeTruthy();
    });

    it('restores an unopened present from the registry after a trip to the minigames', async () => {
        const { scene, fake } = await makeScene({ registry: { currentGift: { coins: 4 } } });
        expect(scene.currentGift).toEqual({ coins: 4 });
        expect(giftBox(fake)).toBeTruthy();
        fake.click(giftBox(fake));
        fake.advance(1500);
        await flush();
        expect(getCoinCount()).toBe(4);
    });
});
