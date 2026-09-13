// Plays minigames through the real minigame scene with random right and wrong
// answers and stray taps, game after game. Every game must end in a reward and
// a fresh game: this is how the frozen reward from a HUD exception (boosterBar)
// was found. Add a driver for a mode when a "the game got stuck" report comes in.
import { describe, it, expect, afterEach } from 'vitest';
import { installFakeScene, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { PokeballGameScene } from '../../src/scenes/PokeballGameScene.js';
import { DEFAULT_MODE_WEIGHTS, getEnabledSlices } from '../../src/minigameWheel.js';

async function makeScene(forcedMode) {
    const scene = new PokeballGameScene();
    const fake = installFakeScene(scene, {
        registry: { pokeballGameMode: forcedMode, wheelSlices: getEnabledSlices({ ...DEFAULT_MODE_WEIGHTS }) }
    });
    window.showPokedex = () => {};
    window.openStore = () => {};
    await scene.create();
    await flush();
    return { scene, fake };
}

const rnd = (n) => Math.floor(Math.random() * n);
const ownInteractives = (fake, mode) => fake.interactives().filter(o => mode.uiElements.includes(o));

// Random taps on the mode's own objects (speaker, listen badges, letters ...)
function strayTaps(fake, mode, log, { force = false } = {}) {
    // Letter keys are answers, not stray taps: the drivers press those.
    const live = ownInteractives(fake, mode).filter(o => !o.getData('letter'));
    if (live.length && Math.random() < 0.7) {
        const o = live[rnd(live.length)];
        fake.click(o, { force });
        log.push(`stray ${o.type}:${o.text || o.getData('letter') || ''}`);
    }
}

// ---- drivers: one answer step per call --------------------------------------

function vowelCorrectIndex(mode) {
    const { targetIsLong, playedIsLong } = mode.challengeData;
    if (mode.constructor.name === 'VowelLengthMode' && mode.roundType === 1) return targetIsLong === playedIsLong ? 0 : 1;
    return targetIsLong ? 0 : 1;
}

function vowelStep(fake, mode, log) {
    if (!mode.optionButtons.length) throw new Error('no cards');
    const wrong = Math.random() < 0.3;
    const idx = wrong ? 1 - vowelCorrectIndex(mode) : vowelCorrectIndex(mode);
    log.push(`${wrong ? 'WRONG' : 'right'} r${mode.roundType} c${mode.correctCount}`);
    fake.click(mode.optionButtons[idx].card);
}

function spellingStep(fake, mode, log) {
    const keys = ownInteractives(fake, mode).filter(o => o.type === 'Rectangle' && o.getData('letter'));
    if (!keys.length) throw new Error('no keys');
    const word = mode.challengeData.word.toUpperCase();
    if (mode.currentLetterIndex >= mode.validIndices.length) {
        // A stray tap finished the word; let the completion sequence run
        log.push(`(word done, waiting) ${word}`);
        return;
    }
    const expected = word[mode.validIndices[mode.currentLetterIndex]];
    // Rarely wrong: two misses reset the word count, and the point is to reach the reward
    const wrong = Math.random() < 0.08;
    const key = wrong
        ? keys.find(k => k.getData('letter') !== expected) || keys[0]
        : keys.find(k => k.getData('letter') === expected);
    if (!key) throw new Error(`no key for ${expected} in ${word}`);
    log.push(`${wrong ? 'WRONG' : 'right'} ${key.getData('letter')} of ${word} (${mode.currentLetterIndex}/${mode.validIndices.length}) words ${mode.wordsCompleted}`);
    fake.click(key);
}

// ---- the loop -----------------------------------------------------------------

async function playGame(scene, fake, step, log, { maxSteps }) {
    const mode = scene.gameMode;
    let guard = 0;
    while (scene.gameMode === mode && !scene.isProcessingAnswer && guard++ < maxSteps) {
        for (let i = 0; i < rnd(3); i++) { strayTaps(fake, mode, log); fake.advance(rnd(300)); }
        step(fake, mode, log);
        for (let i = 0; i < rnd(4); i++) {
            fake.advance(rnd(500));
            strayTaps(fake, mode, log, { force: Math.random() < 0.3 });
        }
        fake.advance(3500);
        await flush();
    }
    if (!scene.isProcessingAnswer) {
        throw new Error(`stuck after ${guard} steps:\n` + log.slice(-25).join('\n'));
    }
    fake.advance(30000);
    await flush();
    if (scene.gameMode === mode || scene.isProcessingAnswer || scene.gameMode.uiElements.length === 0) {
        throw new Error('next game did not start:\n' + log.join('\n'));
    }
}

const CASES = [
    ['vowelsounds-only', vowelStep, 60, [
        { vowelSounds: { required: 4, stage: 'sounds' } },
        { vowelSounds: { required: 4, stage: 'letters' } },
        { vowelSounds: { required: 4, stage: 'mixed' } }
    ]],
    ['vowellength-only', vowelStep, 60, [{ vowelLength: { required: 3, showListenHelp: true } }]],
    ['wordspelling-only', spellingStep, 400, [
        { wordSpelling: { requiredWords: 3, wordCount: 0 } },
        { wordSpelling: { requiredWords: 2, wordCount: 60, prefillHard: true, prefillDoubles: true } },
        { wordSpelling: { requiredWords: 3, wordCount: 0, prefillHard: true, keyboardLetters: 'word' } }
    ]]
];

describe.each(CASES)('soak %s', (forced, step, maxSteps, configs) => {
    afterEach(() => { delete window.showPokedex; delete window.openStore; });

    it('always reaches the reward and the next game', async () => {
        for (const config of configs) {
            setTestConfig(config);
            const { scene, fake } = await makeScene(forced);
            for (let game = 0; game < 12; game++) {
                const log = [`--- game ${game} ${JSON.stringify(config)}`];
                await playGame(scene, fake, step, log, { maxSteps });
                expect(fake._useAfterDestroy).toEqual([]);
            }
        }
    });
});
