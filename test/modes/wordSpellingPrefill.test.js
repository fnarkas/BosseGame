import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { WordSpellingMode } from '../../src/pokeballGameModes/WordSpellingMode.js';
import { SPELLING_WORDS } from '../../src/spellingWords.js';

const LETTER_STEP = 600;

function keyFor(scene, letter) {
    return scene.interactives().find(o => o.type === 'Rectangle' && o.getData('letter') === letter);
}
function givenSlots(mode) {
    return mode.slotsData.slots.filter(s => s.isGiven);
}
function forceWord(mode, word) {
    mode.usedWords = SPELLING_WORDS.filter(w => w !== word);
}

async function start(config, word) {
    setTestConfig({ wordSpelling: { requiredWords: 1, wordCount: 447, ...config } });
    const scene = new FakeScene();
    const mode = new WordSpellingMode();
    const calls = [];
    mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
    forceWord(mode, word);
    await startMode(mode, scene);
    return { scene, mode, calls };
}

describe('WordSpellingMode prefilled hard letters', () => {
    it('is off by default: every letter must be typed', async () => {
        const { mode } = await start({}, 'många');
        expect(mode.givenIndices.size).toBe(0);
        expect(mode.validIndices).toEqual([0, 1, 2, 3, 4]);
        expect(givenSlots(mode)).toHaveLength(0);
    });

    it('fills in the hard group in blue and only asks for the rest', async () => {
        const { scene, mode, calls } = await start({ prefillHard: true }, 'många');
        expect([...mode.givenIndices]).toEqual([2, 3]);
        expect(mode.validIndices).toEqual([0, 1, 4]);
        const given = givenSlots(mode);
        expect(given.map(s => s.letter)).toEqual(['n', 'g']);
        expect(given.every(s => s.bg.fillColor === 0x64B5F6 && s.text && s.text.text)).toBe(true);
        // The first highlighted slot is "m"
        expect(mode.slotsData.highlightedSlot.index).toBe(0);

        for (const letter of ['M', 'Å', 'A']) {
            scene.click(keyFor(scene, letter));
            scene.advance(LETTER_STEP);
        }
        scene.advance(2000);
        expect(calls).toHaveLength(1);
        expect(calls[0].ok).toBe(true);
    });

    it('honours the admin rule list and the double-consonant switch', async () => {
        const { mode } = await start({ prefillHard: true, hardClusters: 'ng', prefillDoubles: true }, 'tack');
        // "ng" only: ck untouched; dubbel: none in "tack" (ck is not a double)
        expect(mode.givenIndices.size).toBe(0);
        forceWord(mode, 'till');
        mode.generateChallenge();
        expect(mode.challengeData.word).toBe('till');
        expect([...mode.givenIndices]).toEqual([3]);
        expect(mode.validIndices).toEqual([0, 1, 2]);
    });

    it('never hands over a whole word', async () => {
        const { mode } = await start({ prefillHard: true, hardClusters: 'ta,ck' }, 'tack');
        expect(mode.givenIndices.size).toBe(0);
        expect(mode.validIndices).toEqual([0, 1, 2, 3]);
    });

    it('can show only the letters in the word, alphabetically, and the word is still spellable', async () => {
        const { scene, mode, calls } = await start({ keyboardLetters: 'word' }, 'kanske');
        const shown = scene.interactives()
            .filter(o => o.type === 'Rectangle' && o.getData('letter'))
            .map(o => o.getData('letter'));
        expect(shown).toEqual(['A', 'E', 'K', 'N', 'S']);
        expect(keyFor(scene, 'Z')).toBeUndefined();
        for (const letter of ['K', 'A', 'N', 'S', 'K', 'E']) {
            scene.click(keyFor(scene, letter));
            scene.advance(LETTER_STEP);
        }
        scene.advance(2000);
        expect(calls).toHaveLength(1);
    });

    it('word-only keyboard leaves out letters that are prefilled', async () => {
        const { scene, mode } = await start({ keyboardLetters: 'word', prefillHard: true }, 'tack');
        const shown = scene.interactives()
            .filter(o => o.type === 'Rectangle' && o.getData('letter'))
            .map(o => o.getData('letter'));
        expect(shown).toEqual(['A', 'T']);
        expect(mode.validIndices).toEqual([0, 1]);
    });

    it('keeps the given slots blue through a wrong answer and the reveal', async () => {
        const { scene, mode } = await start({ prefillHard: true }, 'tack');
        expect([...mode.givenIndices]).toEqual([2, 3]);
        scene.click(keyFor(scene, 'Z'));
        scene.advance(100);
        scene.click(keyFor(scene, 'Q')); // second life gone
        scene.advance(500); // game over -> reveal
        expect(givenSlots(mode).map(s => s.letter)).toEqual(['c', 'k']);
        scene.advance(3000);
        // Same word again (retry), still prefilled
        expect(mode.challengeData.word).toBe('tack');
        expect([...mode.givenIndices]).toEqual([2, 3]);
    });
});
