// Plays the two vowel modes through the real minigame scene with random right
// and wrong answers and stray taps, game after game. Every game must end in a
// reward and a fresh game: this is how the frozen reward from a HUD exception
// (boosterBar) was found.
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

function correctIndex(mode) {
    const { targetIsLong, playedIsLong } = mode.challengeData;
    if (mode.constructor.name === 'VowelLengthMode' && mode.roundType === 1) return targetIsLong === playedIsLong ? 0 : 1;
    return targetIsLong ? 0 : 1;
}

const rnd = (n) => Math.floor(Math.random() * n);

async function playGame(scene, fake, log) {
    const mode = scene.gameMode;
    let guard = 0;
    while (scene.gameMode === mode && !scene.isProcessingAnswer && guard++ < 60) {
        if (!mode.optionButtons.length) { log.push('no cards'); break; }
        // Random pre-taps: speaker, badges, letters
        for (let i = 0; i < rnd(3); i++) {
            const others = fake.interactives().filter(o => o.type === 'Text' && mode.uiElements.includes(o));
            if (others.length) { const o = others[rnd(others.length)]; fake.click(o); log.push(`tap ${o.text}`); fake.advance(rnd(400)); }
        }
        const wrong = Math.random() < 0.3;
        const idx = wrong ? 1 - correctIndex(mode) : correctIndex(mode);
        const card = mode.optionButtons[idx].card;
        log.push(`${wrong ? 'WRONG' : 'right'} r${mode.roundType} c${mode.correctCount}`);
        fake.click(card);
        // Random taps during the reveal
        const steps = rnd(4);
        for (let i = 0; i < steps; i++) {
            fake.advance(rnd(500));
            const live = fake.interactives().filter(o => mode.uiElements.includes(o));
            if (live.length && Math.random() < 0.7) {
                const o = live[rnd(live.length)];
                fake.click(o, { force: Math.random() < 0.3 });
                log.push(`mid ${o.type}:${o.text || ''}`);
            }
        }
        fake.advance(3500);
        await flush();
    }
    if (!scene.isProcessingAnswer) {
        throw new Error(`stuck after ${guard} answers:\n` + log.join('\n'));
    }
    fake.advance(30000);
    await flush();
    if (scene.gameMode === mode || scene.isProcessingAnswer || !scene.gameMode.optionButtons.length) {
        throw new Error('next game did not start:\n' + log.join('\n'));
    }
}

describe.each(['vowelsounds-only', 'vowellength-only'])('soak %s', (forced) => {
    afterEach(() => { delete window.showPokedex; delete window.openStore; });

    it('always reaches the reward and the next game', async () => {
        for (const stage of ['sounds', 'letters', 'mixed']) {
            setTestConfig({ vowelSounds: { required: 4, stage, showListenHelp: true }, vowelLength: { required: 3, showListenHelp: true } });
            const { scene, fake } = await makeScene(forced);
            for (let game = 0; game < 12; game++) {
                const log = [`--- game ${game} stage ${stage}`];
                await playGame(scene, fake, log);
                expect(fake._useAfterDestroy).toEqual([]);
            }
        }
    });
});
