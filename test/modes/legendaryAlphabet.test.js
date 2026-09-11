import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { LegendaryAlphabetMatchMode } from '../../src/pokeballGameModes/LegendaryAlphabetMatchMode.js';
import { loadActiveMinigame, saveActiveMinigame } from '../../src/minigameSession.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');
const SHAKE = 400;        // 50ms * yoyo * 4
const SNAP_BACK = 300;
const REVEAL = 1000;      // the letter is spoken over its gold capital
const FEEDBACK = SHAKE + REVEAL;
const GAME_OVER_WAIT = 1000;
const BAR_WIDTH = 600;

// The mode ends a lost game by driving the scene itself (pick the next mode,
// wire its callback, roll the wheel). Give the FakeScene just that surface.
class NextMode {
    setAnswerCallback(cb) { this.cb = cb; }
    cleanup() {}
}
function wireSceneForGameOver(scene, mode) {
    scene.gameMode = mode;
    scene.challengeCount = 0;
    scene.selectGameMode = vi.fn(async () => {
        await flush();
        scene.gameMode = new NextMode();
    });
    scene.handleAnswer = vi.fn();
    scene.showDiceRollAnimation = vi.fn();
}

describe('LegendaryAlphabetMatchMode', () => {
    let scene, mode, calls;
    const boxFor = (letter) => mode.draggableBoxes.find(b => b.getData('letter') === letter);
    const zoneFor = (letter) => mode.dropZones.find(z => z.getData('letter') === letter);
    const dropOn = (letter, zoneLetter) => scene.drag(boxFor(letter), zoneFor(zoneLetter).x, zoneFor(zoneLetter).y);
    const hearts = () => scene.findText(t => t.text.includes('❤️') || t.text.includes('🖤'));

    beforeEach(async () => {
        scene = new FakeScene();
        mode = new LegendaryAlphabetMatchMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        wireSceneForGameOver(scene, mode);
        await startMode(mode, scene);
    });

    describe('challenge generation and config', () => {
        it('builds a zone and a draggable box for each of the 29 letters', () => {
            expect(mode.challengeData.letters).toEqual(ALPHABET);
            expect(mode.dropZones.map(z => z.getData('letter'))).toEqual(ALPHABET);
            expect([...mode.draggableBoxes.map(b => b.getData('letter'))].sort()).toEqual([...ALPHABET].sort());
            mode.draggableBoxes.forEach(b => {
                expect(b.input.draggable).toBe(true);
                expect(b.getData('letterText').text).toBe(b.getData('letter').toLowerCase());
            });
            expect(mode.progressBarFill.width).toBe(0);
            expect(scene.liveObjectsOfType('Image').map(i => i.textureKey)).toEqual(['treasure-chest']);
            expect(hearts().text).toBe('❤️❤️❤️');
            expect(scene._missingAudio).toEqual([]);
        });

        it('shows only letters and hearts on screen (no counter text)', () => {
            const texts = scene.liveTexts().map(t => t.text);
            texts.forEach(t => {
                if (t.includes('❤️') || t.includes('🖤')) return;
                expect(t).toMatch(/^[A-ZÅÄÖ]?[a-zåäö]?$/);
            });
        });

        it('shuffles the boxes (not always alphabetical)', () => {
            let differs = false;
            for (let i = 0; i < 10 && !differs; i++) {
                const s = new FakeScene();
                const m = new LegendaryAlphabetMatchMode();
                m.generateChallenge();
                m.createChallengeUI(s);
                differs = m.draggableBoxes.map(b => b.getData('letter')).join('') !== ALPHABET.join('');
            }
            expect(differs).toBe(true);
        });

        it('loads coinReward and maxErrors from config', async () => {
            setTestConfig({ legendary: { coinReward: 250, maxErrors: 2 } });
            const s = new FakeScene();
            const m = new LegendaryAlphabetMatchMode();
            await startMode(m, s);
            expect(m.configLoaded).toBe(true);
            expect(m.config).toEqual({ coinReward: 250, maxErrors: 2 });
            expect(m.errorsRemaining).toBe(2);
            expect(s.findText(t => t.text.includes('❤️')).text).toBe('❤️❤️');
        });

        it('accepts a zero coin reward and falls back to defaults when the section is missing', async () => {
            setTestConfig({ legendary: { coinReward: 0, maxErrors: 0 } });
            const m = new LegendaryAlphabetMatchMode();
            await m.loadConfig();
            expect(m.config).toEqual({ coinReward: 0, maxErrors: 3 });

            setTestConfig({ legendary: undefined });
            const m2 = new LegendaryAlphabetMatchMode();
            await m2.loadConfig();
            expect(m2.configLoaded).toBe(true);
            expect(m2.config).toEqual({ coinReward: 100, maxErrors: 3 });
        });
    });

    describe('happy path', () => {
        it('rewards exactly once after every letter has been matched', () => {
            ALPHABET.forEach((letter, i) => {
                expect(dropOn(letter, letter)).toBe(true);
                expect(scene.lastAudio()).toBe(`letter_audio_${letter.toLowerCase()}`);
                expect(zoneFor(letter).getData('matched')).toBe(true);
                expect(boxFor(letter).input.enabled).toBe(false);
                expect(mode.progressBarFill.width).toBeCloseTo(BAR_WIDTH * (i + 1) / 29);
                scene.advance(50);
            });
            expect(mode.errorsRemaining).toBe(3);
            expect(calls).toHaveLength(0);
            scene.advance(500);
            expect(mode.dropZones.every(z => z.getData('upperText').text.length === 2)).toBe(true);
            scene.advance(1000);
            expect(calls).toEqual([{ ok: true, answer: 'legendary-complete', x: 640, y: 450 }]);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene.selectGameMode).not.toHaveBeenCalled();
            expect(scene._missingAudio).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('snaps a box back when dropped outside every zone, without losing a heart', () => {
            const box = boxFor('A');
            scene.drag(box, 50, 850);
            scene.advance(SNAP_BACK);
            expect(box.x).toBe(box.getData('startX'));
            expect(box.y).toBe(box.getData('startY'));
            expect(mode.errorsRemaining).toBe(3);
            expect(mode.matchedCount).toBe(0);
        });

        it('snaps back from an already matched zone without losing a heart', () => {
            dropOn('A', 'A');
            scene.advance(500);
            dropOn('B', 'A');
            scene.advance(SNAP_BACK);
            expect(mode.errorsRemaining).toBe(3);
            expect(mode.matchedCount).toBe(1);
            expect(boxFor('B').x).toBe(boxFor('B').getData('startX'));
        });
    });

    describe('wrong drops', () => {
        it('costs a heart, shakes, returns the box and then accepts drops again', () => {
            dropOn('A', 'B');
            expect(mode.errorsRemaining).toBe(2);
            expect(hearts().text).toBe('❤️❤️🖤');
            expect(zoneFor('B').getData('matched')).toBe(false);
            expect(mode.inputLocked).toBe(true);
            scene.advance(SHAKE + SNAP_BACK);
            expect(boxFor('A').x).toBe(boxFor('A').getData('startX'));
            expect(boxFor('A').getData('letterText').style.color).toBe('#FFFFFF');
            expect(mode.isInputBlocked()).toBe(true); // the letter is still being spoken
            scene.advance(FEEDBACK - SHAKE - SNAP_BACK);
            expect(mode.inputLocked).toBe(false);
            dropOn('A', 'A');
            expect(mode.matchedCount).toBe(1);
            expect(calls).toHaveLength(0);
        });

        it('speaks the letter over its gold capital after a wrong drop, without touching the streak', () => {
            const before = scene.playedAudio().length;
            dropOn('A', 'B');
            scene.advance(SHAKE + 10);
            expect(scene.playedAudio().slice(before)).toEqual(['letter_audio_a']);
            expect(zoneFor('A').fillColor).toBe(0xFFD700);
            expect(zoneFor('B').fillColor).toBe(0xFFFFFF);
            scene.advance(REVEAL);
            expect(zoneFor('A').fillColor).toBe(0xFFFFFF);
            expect(zoneFor('A').fillAlpha).toBe(0.2);
            expect(scene._missingAudio).toEqual([]);
        });

        it('ignores drops while a wrong drop is being shaken (no double heart loss, no sneaky match)', () => {
            dropOn('A', 'B');
            scene.advance(100);
            dropOn('C', 'D');            // second wrong drop mid-shake
            expect(mode.errorsRemaining).toBe(2);
            dropOn('E', 'E');            // correct drop mid-shake
            expect(mode.matchedCount).toBe(0);
            expect(zoneFor('E').getData('matched')).toBe(false);
            scene.advance(SHAKE + SNAP_BACK);
            expect(boxFor('C').x).toBe(boxFor('C').getData('startX'));
            expect(boxFor('E').x).toBe(boxFor('E').getData('startX'));
            expect(mode.errorsRemaining).toBe(2);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });

    describe('game over', () => {
        async function loseAllHearts() {
            dropOn('A', 'B');
            scene.advance(FEEDBACK);
            dropOn('A', 'C');
            scene.advance(FEEDBACK);
            dropOn('A', 'D');
            expect(mode.errorsRemaining).toBe(0);
            expect(hearts().text).toBe('🖤🖤🖤');
        }

        it('hands over to the next mode once, wiring its callback and the wheel', async () => {
            saveActiveMinigame('LegendaryAlphabetMatchMode');
            await loseAllHearts();
            // Extra drops while the game is ending must not count or schedule
            // a second hand-over
            scene.advance(SHAKE + 100);
            dropOn('B', 'B');
            dropOn('C', 'D');
            expect(mode.matchedCount).toBe(0);
            scene.advance(GAME_OVER_WAIT);
            await flush();

            expect(scene.selectGameMode).toHaveBeenCalledTimes(1);
            expect(scene.challengeCount).toBe(1);
            expect(scene.gameMode).toBeInstanceOf(NextMode);
            expect(typeof scene.gameMode.cb).toBe('function');
            scene.gameMode.cb(true, 'x', 1, 2);
            expect(scene.handleAnswer).toHaveBeenCalledWith(true, 'x', 1, 2);
            expect(scene.showDiceRollAnimation).toHaveBeenCalledTimes(1);
            expect(loadActiveMinigame()).toBe('NextMode');
            expect(calls).toHaveLength(0);
            expect(scene.liveObjects()).toEqual([]);
            expect(mode.errorsRemaining).toBe(3);

            scene.advance(10000);
            await flush();
            expect(scene.selectGameMode).toHaveBeenCalledTimes(1);
            expect(scene.showDiceRollAnimation).toHaveBeenCalledTimes(1);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('returns to the main scene instead of the wheel when the mode was forced', async () => {
            scene.registry.set('pokeballGameMode', 'legendary-only');
            saveActiveMinigame('LegendaryAlphabetMatchMode');
            await loseAllHearts();
            scene.advance(SHAKE + SNAP_BACK + GAME_OVER_WAIT);
            await flush();
            expect(scene.selectGameMode).toHaveBeenCalledTimes(1);
            expect(typeof scene.gameMode.cb).toBe('function');
            expect(loadActiveMinigame()).toBeNull();
            expect(scene.showDiceRollAnimation).not.toHaveBeenCalled();
            expect(scene.sceneCalls).toEqual([{ method: 'start', key: 'MainGameScene', data: undefined }]);
        });
    });

    describe('cleanup', () => {
        it('leaves nothing behind when cleaned up mid-shake', () => {
            dropOn('A', 'A');
            dropOn('B', 'C');
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene.selectGameMode).not.toHaveBeenCalled();
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('never delivers the reward or the hand-over after cleanup', async () => {
            ALPHABET.forEach(letter => dropOn(letter, letter));
            scene.advance(100); // completion timer pending
            mode.cleanup(scene);
            scene.advance(10000);
            await flush();
            expect(calls).toHaveLength(0);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });
});
