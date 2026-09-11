import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installFakeScene, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { PokeballGameScene } from '../../src/scenes/PokeballGameScene.js';
import { WHEEL_SLICES, DEFAULT_MODE_WEIGHTS, getEnabledSlices } from '../../src/minigameWheel.js';
import { loadActiveMinigame, saveActiveMinigame } from '../../src/minigameSession.js';
import { getCoinCount } from '../../src/currency.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

async function makeScene({ forcedMode = null, weights = null } = {}) {
    if (weights) setTestConfig({ weights });
    const scene = new PokeballGameScene();
    const fake = installFakeScene(scene, {
        registry: {
            pokeballGameMode: forcedMode,
            wheelSlices: getEnabledSlices({ ...DEFAULT_MODE_WEIGHTS, ...(weights || {}) })
        }
    });
    window.showPokedex = () => {};
    window.openStore = () => {};
    await scene.create();
    await flush();
    return { scene, fake };
}

describe('PokeballGameScene', () => {
    afterEach(() => {
        delete window.showPokedex;
        delete window.openStore;
    });

    it('starts the forced mode straight away and builds its UI', async () => {
        const { scene, fake } = await makeScene({ forcedMode: 'letter-only' });
        expect(scene.gameMode.constructor.name).toBe('LetterListeningMode');
        expect(scene.gameMode.answerCallback).toBeTypeOf('function');
        expect(fake.liveObjectsOfType('Rectangle').length).toBeGreaterThan(5);
        expect(loadActiveMinigame()).toBeNull();
    });

    it('pays coins, tears down the old mode and starts the next one after a correct answer', async () => {
        incrementStreak(); // streak 1 -> multiplier 1
        const { scene, fake } = await makeScene({ forcedMode: 'addition-only' });
        const oldMode = scene.gameMode;
        const before = getCoinCount();
        oldMode.answerCallback(true, 'x', 640, 450);
        expect(scene.isProcessingAnswer).toBe(true);
        fake.advance(15000);
        await flush();
        expect(getCoinCount()).toBeGreaterThan(before);
        expect(scene.coinCounterText.text).toBe(`${getCoinCount()}`);
        expect(getStreak()).toBe(2);
        expect(scene.gameMode).not.toBe(oldMode);
        expect(oldMode.uiElements).toEqual([]);
        expect(scene.isProcessingAnswer).toBe(false);
        // No reward-animation leftovers
        expect(fake.liveTexts().filter(t => t.text.startsWith("+")).map(t => t.text)).toEqual([]);
    });

    it('ignores a second answer while the reward is being shown', async () => {
        const { scene, fake } = await makeScene({ forcedMode: 'addition-only' });
        const before = getCoinCount();
        scene.gameMode.answerCallback(true, 'x', 640, 450);
        scene.gameMode.answerCallback(true, 'x', 640, 450);
        fake.advance(15000);
        await flush();
        const gained = getCoinCount() - before;
        expect(gained).toBeGreaterThan(0);
        expect(gained).toBeLessThanOrEqual(3 * 5);
    });

    it('pays the configured flat reward for a legendary mode without touching the streak', async () => {
        incrementStreak();
        setTestConfig({ legendary: { coinReward: 100, maxErrors: 3 } });
        const { scene, fake } = await makeScene({ forcedMode: 'legendary-only' });
        const before = getCoinCount();
        scene.gameMode.answerCallback(true, 'x', 640, 450);
        fake.advance(20000);
        await flush();
        expect(getCoinCount() - before).toBe(100);
        expect(getStreak()).toBe(1);
        expect(scene.isProcessingAnswer).toBe(false);
    });

    it('resets the streak on a wrong answer and unlocks input again', async () => {
        incrementStreak();
        const { scene, fake } = await makeScene({ forcedMode: 'addition-only' });
        scene.gameMode.answerCallback(false, 'x', 640, 450);
        expect(getStreak()).toBe(0);
        expect(scene.isProcessingAnswer).toBe(true);
        fake.advance(1500);
        expect(scene.isProcessingAnswer).toBe(false);
    });

    it('rolls a mode, remembers it and shows the wheel in normal play', async () => {
        const { scene, fake } = await makeScene();
        expect(loadActiveMinigame()).toBe(scene.gameMode.constructor.name);
        const wheel = fake.liveObjectsOfType('Image').find(i => i.textureKey === 'game-wheel');
        expect(wheel).toBeTruthy();
        // No challenge UI yet: only the wheel overlay, hud and booster bars
        expect(scene.gameMode.uiElements).toEqual([]);
        fake.click(wheel);
        fake.advance(6000);
        await flush();
        expect(scene.gameMode.uiElements.length).toBeGreaterThan(0);
        expect(fake.liveObjectsOfType('Image').find(i => i.textureKey === 'game-wheel')).toBeUndefined();
    });

    it('lands the wheel on the slice of the rolled mode', async () => {
        const { scene, fake } = await makeScene();
        const wheel = fake.liveObjectsOfType('Image').find(i => i.textureKey === 'game-wheel');
        fake.click(wheel);
        fake.advance(4000);
        const slices = fake.registry.get('wheelSlices');
        const index = slices.findIndex(s => s.classNames.includes(scene.gameMode.constructor.name));
        expect(index).toBeGreaterThanOrEqual(0);
        const sliceAngle = 360 / slices.length;
        const angle = ((wheel.angle % 360) + 360) % 360;
        const expected = ((-index * sliceAngle) % 360 + 360) % 360;
        let diff = Math.abs(angle - expected);
        diff = Math.min(diff, 360 - diff);
        expect(diff).toBeLessThan(sliceAngle / 2);
    });

    it('resumes the saved mode after a reload without showing the wheel', async () => {
        saveActiveMinigame('AdditionMode');
        const { scene, fake } = await makeScene();
        expect(scene.gameMode.constructor.name).toBe('AdditionMode');
        expect(fake.liveObjectsOfType('Image').find(i => i.textureKey === 'game-wheel')).toBeUndefined();
        expect(scene.gameMode.uiElements.length).toBeGreaterThan(0);
    });

    it('ignores an unknown saved mode name and rolls a fresh one', async () => {
        saveActiveMinigame('NoSuchMode');
        const { scene, fake } = await makeScene();
        expect(scene.gameMode).toBeTruthy();
        expect(loadActiveMinigame()).toBe(scene.gameMode.constructor.name);
    });

    it('leaving at the wheel clears the session and returns to catching', async () => {
        const { scene, fake } = await makeScene();
        const pokeball = fake.liveObjectsOfType('Image').find(i => i.textureKey === 'pokeball_poke-ball');
        fake.click(pokeball);
        expect(loadActiveMinigame()).toBeNull();
        expect(fake.sceneCalls).toEqual([{ method: 'start', key: 'MainGameScene', data: undefined }]);
    });

    it('never rolls a mode whose weight is 0', async () => {
        const weights = Object.fromEntries(Object.keys(DEFAULT_MODE_WEIGHTS).map(k => [k, 0]));
        weights.addition = 10;
        for (let i = 0; i < 10; i++) {
            localStorage.clear();
            const { scene } = await makeScene({ weights });
            expect(scene.gameMode.constructor.name).toBe('AdditionMode');
        }
    });

    it('can roll every mode the wheel knows about', async () => {
        const seen = new Set();
        const keys = Object.keys(DEFAULT_MODE_WEIGHTS);
        for (const key of keys) {
            localStorage.clear();
            const weights = Object.fromEntries(keys.map(k => [k, 0]));
            weights[key] = 10;
            const { scene } = await makeScene({ weights });
            seen.add(scene.gameMode.constructor.name);
        }
        const allClassNames = WHEEL_SLICES.flatMap(s => s.classNames);
        for (const name of allClassNames) expect(seen).toContain(name);
    });

    it('runs every mode through create() in forced mode without throwing', async () => {
        const forced = ['letter-only', 'word-emoji-only', 'directions-only', 'lettermatch-only',
            'numbers-only', 'emojiword-only', 'wordspelling-only', 'legendary-only',
            'legendary-numbers-only', 'dayofweek-only', 'addition-only', 'multiplication-only',
            'vowellength-only', 'vowelsounds-only', 'numberbonds-only', 'shapedirections-only',
            'clocklistening-only', 'clockreading-only', 'piano-only', 'speedreading-only'];
        for (const mode of forced) {
            localStorage.clear();
            const { scene, fake } = await makeScene({ forcedMode: mode });
            expect(scene.gameMode, mode).toBeTruthy();
            fake.advance(3000);
            await flush();
            expect(fake._missingAudio, mode).toEqual([]);
            expect(fake._missingTextures, mode).toEqual([]);
        }
    });

    it('has an always-visible home button that leaves the minigame and forgets the session', async () => {
        const { scene, fake } = await makeScene({ forcedMode: 'addition-only' });
        saveActiveMinigame('AdditionMode');
        const home = fake.liveObjectsOfType('Image').find(i => i.name === 'home-button');
        expect(home).toBeTruthy();
        expect(home.depth).toBeGreaterThanOrEqual(1002);
        fake.click(home);
        expect(loadActiveMinigame()).toBeNull();
        expect(fake.sceneCalls).toEqual([{ method: 'start', key: 'MainGameScene', data: undefined }]);
        expect(scene.gameMode.uiElements).toEqual([]); // shutdown tore the mode down
    });

    it('ignores the home button while an answer is being rewarded', async () => {
        const { scene, fake } = await makeScene({ forcedMode: 'addition-only' });
        scene.gameMode.answerCallback(true, 'x', 640, 450);
        const home = fake.liveObjectsOfType('Image').find(i => i.name === 'home-button');
        fake.click(home);
        expect(fake.sceneCalls).toEqual([]);
    });

    it('pays a milestone bonus with a celebration when the streak reaches 3', async () => {
        incrementStreak();
        incrementStreak(); // 2 -> next win makes 3
        const { scene, fake } = await makeScene({ forcedMode: 'addition-only' });
        const before = getCoinCount();
        scene.gameMode.answerCallback(true, 'x', 640, 450);
        let seenParty = false;
        for (let t = 0; t < 20000 && !seenParty; t += 250) {
            fake.advance(250);
            await flush();
            if (fake.findText('🎉')) seenParty = true;
        }
        expect(seenParty).toBe(true);
        fake.advance(15000);
        await flush();
        const gained = getCoinCount() - before;
        // base 1-3 coins x3 multiplier, plus the 5-coin milestone bonus
        expect(gained).toBeGreaterThanOrEqual(3 + 5);
        expect(gained).toBeLessThanOrEqual(9 + 5);
        expect(fake.findText('🎉')).toBeFalsy();
        expect(scene.coinCounterText.text).toBe(`${getCoinCount()}`);
        expect(scene.isProcessingAnswer).toBe(false);
    });
});
