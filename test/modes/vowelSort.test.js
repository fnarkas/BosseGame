import { describe, it, expect } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import {
    VowelSortMode, STAGE_DRAG, STAGE_BUTTONS, STAGE_MIXED, ROUND_DRAG, ROUND_BUTTONS, LABEL_LONG, LABEL_SHORT, clampLetters
} from '../../src/pokeballGameModes/VowelSortMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';
import { getGameModeMistakes } from '../../src/wrongAnswers.js';

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö'];
const key = (vowel, isLong) => `vowel_audio_${vowel}_${isLong ? 'long' : 'short'}`;

const bucket = (mode, isLong) => mode.buckets.find(z => z.getData('isLong') === isLong);
const card = (mode, isLong, vowel = null) => mode.cards.find(c => c.isLong === isLong && !c.sorted && (!vowel || c.vowel === vowel));
const dragTo = (scene, c, zone) => scene.drag(c.box, zone.x, zone.y);
const speaker = (scene) => scene.findText(t => t.text === '🔊' && t.y === 190);
const buttons = (mode) => mode.optionButtons.map(b => b.text.text);
const correctButton = (mode) => mode.optionButtons[mode.challengeData.targetIsLong ? 0 : 1].card;
const wrongButton = (mode) => mode.optionButtons[mode.challengeData.targetIsLong ? 1 : 0].card;
// Feedback + reveal + pause before the next task, with margin.
const NEXT_TASK_MS = 3500;

async function start(stage, extra = {}) {
    setTestConfig({ vowelSort: { stage, letters: 2, required: 3, ...extra } });
    const scene = new FakeScene();
    const mode = new VowelSortMode();
    const calls = [];
    mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
    await startMode(mode, scene);
    return { scene, mode, calls };
}

// Sort every card on the board into its bucket.
function solveBoard(scene, mode) {
    for (const c of [...mode.cards]) {
        dragTo(scene, c, bucket(mode, c.isLong));
    }
}

describe('VowelSortMode', () => {
    describe('config', () => {
        it('reads stage, letters and required from the vowelSort section', async () => {
            const { mode } = await start(STAGE_BUTTONS, { letters: 4, required: 5 });
            expect(mode.configLoaded).toBe(true);
            expect(mode.stage).toBe(STAGE_BUTTONS);
            expect(mode.lettersPerRound).toBe(4);
            expect(mode.requiredCorrect).toBe(5);
            expect(mode.progressBalls.circles).toHaveLength(5);
        });

        it('keeps the letter count even and within 2-6, and ignores an unknown stage', async () => {
            expect(clampLetters(3)).toBe(2);
            expect(clampLetters(5)).toBe(4);
            expect(clampLetters(0)).toBe(2);
            expect(clampLetters(99)).toBe(6);
            expect(clampLetters('x')).toBe(2);
            const { mode } = await start('bogus', { letters: 7 });
            expect(mode.stage).toBe(STAGE_DRAG);
            expect(mode.lettersPerRound).toBe(6);
            expect(mode.cards).toHaveLength(6);
            expect(new Set(mode.cards.map(c => c.vowel)).size).toBe(3);
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ vowelSort: undefined });
            const m = new VowelSortMode();
            await m.loadConfig();
            expect(m.stage).toBe(STAGE_DRAG);
            expect(m.lettersPerRound).toBe(2);
            expect(m.requiredCorrect).toBe(3);
        });
    });

    describe('drag board', () => {
        it('shows the same vowel once long and once short, and the LÅNG / KORT buckets', async () => {
            const { scene, mode } = await start(STAGE_DRAG);
            expect(mode.roundType).toBe(ROUND_DRAG);
            expect(mode.cards).toHaveLength(2);
            const [a, b] = mode.cards;
            expect(a.vowel).toBe(b.vowel);
            expect(VOWELS).toContain(a.vowel);
            expect([a.isLong, b.isLong].sort()).toEqual([false, true]);
            expect(mode.cards.map(c => c.text.text)).toEqual([a.vowel.toUpperCase(), a.vowel.toUpperCase()]);
            // Long bucket on the left, short on the right, labelled with the words
            expect(bucket(mode, true).x).toBeLessThan(bucket(mode, false).x);
            const labels = scene.findTexts(t => t.getData('bucketLabel') !== undefined);
            expect(labels.map(t => t.text)).toEqual([LABEL_LONG, LABEL_SHORT]);
            expect(mode.progressBalls.circles).toHaveLength(3);
            // Nothing plays until the child asks: each card is its own stimulus
            expect(scene.playedAudio()).toEqual([]);
            expect(speaker(scene)).toBeNull();
        });

        it('shuffles the two cards over many boards', async () => {
            const firstIsLong = new Set();
            for (let i = 0; i < 40; i++) {
                const { mode } = await start(STAGE_DRAG);
                firstIsLong.add(mode.cards[0].isLong);
            }
            expect(firstIsLong).toEqual(new Set([true, false]));
        });

        it('only ever draws the letters, the speaker badges and the two bucket words', async () => {
            const { scene, mode } = await start(STAGE_DRAG, { letters: 4 });
            // (🎁 is the reward at the end of the progress balls)
            const allowed = new Set(['🔊', '🎁', LABEL_LONG, LABEL_SHORT, ...mode.cards.map(c => c.text.text)]);
            for (const t of scene.liveTexts()) expect(allowed.has(t.text), t.text).toBe(true);
        });

        it('tapping a card plays that card\'s sound', async () => {
            const { scene, mode } = await start(STAGE_DRAG);
            const long = card(mode, true);
            scene.click(long.box);
            expect(scene.lastAudio()).toBe(key(long.vowel, true));
            scene.click(card(mode, false).box);
            expect(scene.lastAudio()).toBe(key(long.vowel, false));
        });

        it('a card dropped in the right bucket stays there; the full board fills one ball and moves on', async () => {
            const { scene, mode, calls } = await start(STAGE_DRAG);
            const vowel = mode.cards[0].vowel;
            const long = card(mode, true);
            expect(dragTo(scene, long, bucket(mode, true))).toBe(true);
            expect(long.sorted).toBe(true);
            expect(long.box.input.enabled).toBe(false);
            expect(scene.lastAudio()).toBe(key(vowel, true));
            expect(mode.correctCount).toBe(0);

            dragTo(scene, card(mode, false), bucket(mode, false));
            expect(mode.correctCount).toBe(1);
            scene.advance(NEXT_TASK_MS);
            // A fresh board with fresh cards
            expect(mode.cards).toHaveLength(2);
            expect(mode.cards.every(c => !c.sorted)).toBe(true);
            expect(calls).toHaveLength(0);
        });

        it('three boards in a row win exactly one reward, with no missing audio', async () => {
            const { scene, mode, calls } = await start(STAGE_DRAG);
            for (let i = 0; i < 3; i++) {
                solveBoard(scene, mode);
                scene.advance(NEXT_TASK_MS);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._missingAudio).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('a card dropped outside both buckets slides back and stays draggable', async () => {
            const { scene, mode } = await start(STAGE_DRAG);
            const long = card(mode, true);
            scene.drag(long.box, 640, 450);
            scene.advance(400);
            expect(long.sorted).toBe(false);
            expect(long.box.x).toBe(long.box.getData('startX'));
            expect(long.box.y).toBe(long.box.getData('startY'));
            expect(long.box.input.enabled).toBe(true);
            expect(mode.isInputBlocked()).toBe(false);
        });

        it('a wrong drop shakes the card back, lights the right bucket while the sound plays, and keeps the board', async () => {
            const { scene, mode } = await start(STAGE_DRAG);
            incrementStreak();
            const vowel = mode.cards[0].vowel;
            const long = card(mode, true);
            dragTo(scene, long, bucket(mode, false));
            expect(long.sorted).toBe(false);
            expect(mode.isInputBlocked()).toBe(true);
            // Frozen: the other card can not be sorted meanwhile
            expect(dragTo(scene, card(mode, false), bucket(mode, false))).toBe(true);
            expect(card(mode, false).sorted).toBe(false);

            scene.advance(1200);
            expect(long.box.x).toBe(long.box.getData('startX'));
            expect(scene.playedAudio()).toContain(key(vowel, true));
            expect(bucket(mode, true).fillColor).toBe(0xFFD700);
            const mistakes = Object.keys(getGameModeMistakes('VowelSortMode'));
            expect(mistakes).toHaveLength(1);
            expect(mistakes[0]).toContain(`${vowel}_long`);

            // After the reveal the board is back in play, same cards
            scene.advance(NEXT_TASK_MS);
            expect(mode.cards).toHaveLength(2);
            expect(mode.isInputBlocked()).toBe(false);
            expect(bucket(mode, true).fillColor).toBe(0xFFFFFF);
            solveBoard(scene, mode);
            expect(mode.correctCount).toBe(1);
            // The miss cost the streak once the board was done
            scene.advance(NEXT_TASK_MS);
            expect(getStreak()).toBe(0);
            // ...and the missed vowel is on the next board
            expect(mode.cards.map(c => c.vowel)).toContain(vowel);
        });

        it('keeps the streak when a board is sorted without a miss', async () => {
            const { scene, mode } = await start(STAGE_DRAG);
            incrementStreak();
            solveBoard(scene, mode);
            scene.advance(NEXT_TASK_MS);
            expect(getStreak()).toBe(1);
        });

        it('a board of four holds two different vowels, each long and short', async () => {
            const { scene, mode } = await start(STAGE_DRAG, { letters: 4 });
            expect(mode.cards).toHaveLength(4);
            const vowels = new Set(mode.cards.map(c => c.vowel));
            expect(vowels.size).toBe(2);
            for (const v of vowels) {
                expect(mode.cards.filter(c => c.vowel === v).map(c => c.isLong).sort()).toEqual([false, true]);
            }
            solveBoard(scene, mode);
            expect(mode.correctCount).toBe(1);
        });
    });

    describe('buttons stage', () => {
        it('plays one sound alone and offers LÅNG / KORT, nothing to compare with', async () => {
            const { scene, mode } = await start(STAGE_BUTTONS);
            expect(mode.roundType).toBe(ROUND_BUTTONS);
            expect(VOWELS).toContain(mode.challengeData.vowel);
            expect(buttons(mode)).toEqual([LABEL_LONG, LABEL_SHORT]);
            expect(speaker(scene)).toBeTruthy();
            // No listen badges on the cards, no letter shown yet
            expect(scene.findTexts(t => t.text === '🔊')).toHaveLength(1);
            expect(scene.findText(t => t.text === mode.challengeData.vowel.toUpperCase())).toBeNull();
            expect(scene.playedAudio()).toEqual([]);
            scene.advance(300);
            expect(scene.lastAudio()).toBe(key(mode.challengeData.vowel, mode.challengeData.targetIsLong));
            scene.click(speaker(scene));
            expect(scene.playedAudio()).toHaveLength(2);
        });

        it('a right answer shows the letter with its length written out, fills a ball and moves on', async () => {
            const { scene, mode, calls } = await start(STAGE_BUTTONS);
            const { vowel, targetIsLong } = mode.challengeData;
            scene.click(correctButton(mode));
            expect(mode.correctCount).toBe(1);
            expect(scene.findText(t => t.text === vowel.toUpperCase())).toBeTruthy();
            expect(scene.findText(t => t.text === (targetIsLong ? LABEL_LONG : LABEL_SHORT) && t.y > 300)).toBeTruthy();
            scene.advance(NEXT_TASK_MS);
            expect(mode.correctCount).toBe(1);
            expect(buttons(mode)).toEqual([LABEL_LONG, LABEL_SHORT]);
            for (let i = 0; i < 2; i++) {
                scene.click(correctButton(mode));
                scene.advance(NEXT_TASK_MS);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            expect(scene._missingAudio).toEqual([]);
        });

        it('a wrong answer lights the right button, says the sound again, and re-asks it next', async () => {
            const { scene, mode } = await start(STAGE_BUTTONS);
            const { vowel, targetIsLong } = mode.challengeData;
            incrementStreak();
            scene.click(wrongButton(mode));
            expect(mode.correctCount).toBe(0);
            scene.advance(600);
            expect(correctButton(mode).fillColor).toBe(0x27AE60);
            expect(scene.playedAudio().filter(k => k === key(vowel, targetIsLong)).length).toBeGreaterThanOrEqual(2);
            expect(Object.keys(getGameModeMistakes('VowelSortMode'))[0]).toContain(`${vowel}_${targetIsLong ? 'long' : 'short'}`);
            scene.advance(NEXT_TASK_MS);
            expect(getStreak()).toBe(0);
            expect(mode.challengeData).toMatchObject({ vowel, targetIsLong });
        });

        it('never asks the exact same sound twice in a row', async () => {
            const { scene, mode } = await start(STAGE_BUTTONS, { required: 9 });
            let repeats = 0;
            for (let i = 0; i < 8; i++) {
                const before = { ...mode.challengeData };
                scene.click(correctButton(mode));
                scene.advance(NEXT_TASK_MS);
                if (mode.challengeData.vowel === before.vowel && mode.challengeData.targetIsLong === before.targetIsLong) repeats++;
            }
            expect(repeats).toBe(0);
        });
    });

    describe('mixed stage', () => {
        it('alternates a drag board and a single-sound question', async () => {
            const { scene, mode, calls } = await start(STAGE_MIXED, { required: 4 });
            const rounds = [];
            for (let i = 0; i < 4; i++) {
                rounds.push(mode.roundType);
                if (mode.roundType === ROUND_DRAG) solveBoard(scene, mode);
                else scene.click(correctButton(mode));
                scene.advance(NEXT_TASK_MS);
            }
            expect(rounds).toEqual([ROUND_DRAG, ROUND_BUTTONS, ROUND_DRAG, ROUND_BUTTONS]);
            expect(calls).toHaveLength(1);
        });

        it('a sound missed on the buttons comes back on the next board', async () => {
            const { scene, mode } = await start(STAGE_MIXED, { required: 4 });
            solveBoard(scene, mode);
            scene.advance(NEXT_TASK_MS);
            expect(mode.roundType).toBe(ROUND_BUTTONS);
            const { vowel } = mode.challengeData;
            scene.click(wrongButton(mode));
            scene.advance(NEXT_TASK_MS);
            // Re-asked straight away as a question...
            expect(mode.challengeData.vowel).toBe(vowel);
            scene.click(correctButton(mode));
            scene.advance(NEXT_TASK_MS);
            expect(mode.roundType).toBe(ROUND_DRAG);
            solveBoard(scene, mode);
            scene.advance(NEXT_TASK_MS);
            // ...and once more two tasks later
            expect(mode.roundType).toBe(ROUND_BUTTONS);
            expect(mode.challengeData.vowel).toBe(vowel);
        });
    });

    describe('lockout', () => {
        it('counts a double tap on the correct button once', async () => {
            const { scene, mode } = await start(STAGE_BUTTONS);
            scene.click(correctButton(mode));
            scene.click(correctButton(mode));
            expect(mode.correctCount).toBe(1);
        });

        it('does not fire the reward twice when the last button is tapped repeatedly', async () => {
            const { scene, mode, calls } = await start(STAGE_BUTTONS, { required: 1 });
            scene.click(correctButton(mode));
            scene.click(correctButton(mode));
            scene.advance(NEXT_TASK_MS);
            expect(calls).toHaveLength(1);
        });
    });

    describe('cleanup', () => {
        it('mid-shake on the board: leaves no orphaned UI, timers, tweens or late callbacks', async () => {
            const { scene, mode } = await start(STAGE_DRAG);
            dragTo(scene, card(mode, true), bucket(mode, false));
            scene.advance(100);
            const t = scene.now;
            mode.cleanup(scene);
            expect(scene.liveObjects()).toEqual([]);
            scene.advance(10000);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('mid-reveal after a right answer on the buttons: nothing comes back', async () => {
            const { scene, mode } = await start(STAGE_BUTTONS);
            scene.click(correctButton(mode));
            scene.advance(200);
            const t = scene.now;
            mode.cleanup(scene);
            scene.advance(10000);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
        });
    });

    describe('long games', () => {
        it('plays boards of six with misses and no missing audio', async () => {
            for (let game = 0; game < 5; game++) {
                const { scene, mode, calls } = await start(STAGE_DRAG, { letters: 6, required: 2 });
                for (let board = 0; board < 2; board++) {
                    const first = card(mode, true);
                    dragTo(scene, first, bucket(mode, false));
                    scene.advance(NEXT_TASK_MS);
                    solveBoard(scene, mode);
                    scene.advance(NEXT_TASK_MS);
                }
                expect(calls).toEqual([expect.objectContaining({ ok: true })]);
                expect(scene._missingAudio).toEqual([]);
                expect(scene._useAfterDestroy).toEqual([]);
                mode.cleanup(scene);
                expect(scene.liveObjects()).toEqual([]);
            }
        });
    });
});
