import { describe, it, expect, afterEach, vi } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { NumberListeningMode } from '../../src/pokeballGameModes/NumberListeningMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

const PLACE_DIGIT = {
    thousands: (mode) => mode.challengeData.thousands,
    hundreds: (mode) => mode.challengeData.hundreds,
    tens: (mode) => mode.challengeData.tens,
    ones: (mode) => mode.challengeData.ones
};

describe('NumberListeningMode', () => {
    let scene, mode, calls;

    async function setup(config = { required: 2, numbers: '456, 34' }) {
        setTestConfig({ numbers: config });
        scene = new FakeScene();
        mode = new NumberListeningMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    }

    const boxFor = (digit) => mode.digitBoxes.find(b => b.getData('digit') === digit);
    const drop = (digit, zone) => scene.drag(boxFor(digit), zone.x, zone.y);
    // Fill every visible zone with the correct digit, optionally corrupting the ones digit
    function enter(wrongOnes = false) {
        for (const zone of mode.getZones()) {
            let digit = PLACE_DIGIT[zone.getData('place')](mode);
            if (wrongOnes && zone.getData('place') === 'ones') digit = (digit + 1) % 10;
            drop(digit, zone);
        }
    }

    afterEach(() => {
        if (scene) {
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);
        }
        scene = null;
    });

    describe('config and challenge generation', () => {
        it('loads the numbers section from the config file', async () => {
            setTestConfig(null);
            const m = new NumberListeningMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(5);
            expect(m.availableNumbers).toEqual([199, 234, 456, 644, 777, 788, 945, 982]);
        });

        it('falls back to 10-99 when the section is missing or the fetch fails', async () => {
            setTestConfig({ numbers: undefined });
            const m = new NumberListeningMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(1);
            expect(m.availableNumbers[0]).toBe(10);
            expect(m.availableNumbers[m.availableNumbers.length - 1]).toBe(99);

            const failing = new NumberListeningMode();
            const orig = globalThis.fetch;
            globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });
            try {
                await failing.loadConfig();
            } finally {
                globalThis.fetch = orig;
            }
            expect(failing.configLoaded).toBe(true);
            expect(failing.availableNumbers).toHaveLength(90);
        });

        it('parses ranges, lists and skips invalid parts', () => {
            const m = new NumberListeningMode();
            expect(m.parseNumberRange('12-15, 30,40')).toEqual([12, 13, 14, 15, 30, 40]);
            expect(m.parseNumberRange('5-3, x, -2')).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
            expect(m.parseNumberRange('7, 7, 7')).toEqual([7]);
        });

        it('always picks a configured number, splits digits correctly and never repeats back to back', async () => {
            setTestConfig({ numbers: { required: 1, numbers: '0-9, 10-99, 100-999, 1000' } });
            const m = new NumberListeningMode();
            await m.loadConfig();
            let previous = null;
            for (let i = 0; i < 500; i++) {
                m.generateChallenge();
                const n = m.currentNumber;
                expect(m.availableNumbers).toContain(n);
                const d = m.challengeData;
                expect(d.thousands * 1000 + d.hundreds * 100 + d.tens * 10 + d.ones).toBe(n);
                expect(n).not.toBe(previous);
                previous = n;
            }
        });

        it('still produces a challenge when generateChallenge runs before loadConfig', () => {
            const m = new NumberListeningMode();
            m.generateChallenge();
            expect(m.currentNumber).toBeGreaterThanOrEqual(10);
            expect(m.currentNumber).toBeLessThanOrEqual(99);
        });
    });

    describe('UI and audio', () => {
        it('shows one drop zone per digit and ten draggable digit boxes', async () => {
            await setup({ required: 1, numbers: '456' });
            expect(mode.getZones().map(z => z.getData('place'))).toEqual(['hundreds', 'tens', 'ones']);
            expect(mode.digitBoxes).toHaveLength(10);
            mode.digitBoxes.forEach(b => expect(b.input.draggable).toBe(true));
            expect(scene.findText('🔊')).not.toBeNull();
            expect(scene.findText('🎁')).not.toBeNull();

            await setup({ required: 1, numbers: '34' });
            expect(mode.getZones().map(z => z.getData('place'))).toEqual(['tens', 'ones']);

            await setup({ required: 1, numbers: '1000' });
            expect(mode.getZones().map(z => z.getData('place'))).toEqual(['thousands', 'hundreds', 'tens', 'ones']);
        });

        it('stitches hundreds + remainder for numbers over 99 and replays on the speaker', async () => {
            await setup({ required: 1, numbers: '456' });
            expect(scene.playedAudio()).toEqual(['number_audio_400']);
            scene.advance(600);
            expect(scene.playedAudio()).toEqual(['number_audio_400', 'number_audio_56']);

            scene.click(scene.findText('🔊'));
            scene.advance(600);
            expect(scene.playedAudio()).toEqual(['number_audio_400', 'number_audio_56', 'number_audio_400', 'number_audio_56']);
        });

        it('does not play the remainder twice when the speaker is tapped mid-stitch', async () => {
            await setup({ required: 1, numbers: '456' });
            scene.advance(100);
            scene.click(scene.findText('🔊'));
            scene.advance(2000);
            expect(scene.playedAudio()).toEqual(['number_audio_400', 'number_audio_400', 'number_audio_56']);
        });

        it('plays a single file for numbers under 100 and for 1000', async () => {
            await setup({ required: 1, numbers: '34' });
            scene.advance(2000);
            expect(scene.playedAudio()).toEqual(['number_audio_34']);

            await setup({ required: 1, numbers: '1000' });
            scene.advance(2000);
            expect(scene.playedAudio()).toEqual(['number_audio_1000']);
        });

        it('opens the progress popup from the matrix icon', async () => {
            await setup({ required: 1, numbers: '34' });
            mode.showMatrixPopup = vi.fn();
            const icon = scene.interactives().find(o => o.type === 'Rectangle' && o.fillColor === 0x3498DB);
            scene.click(icon);
            expect(mode.showMatrixPopup).toHaveBeenCalledTimes(1);
        });
    });

    describe('answering', () => {
        it('rewards exactly once after the required number of correct answers', async () => {
            await setup({ required: 2, numbers: '456, 34' });
            enter();
            expect(mode.correctInRow).toBe(1);
            expect(mode.ballIndicators[0].fillColor).toBe(0x27AE60);
            expect(mode.ballIndicators[1].fillColor).toBe(0xffffff);
            scene.advance(1000);
            // A new challenge is on screen
            expect(mode.correctInRow).toBe(1);
            expect(mode.getZones().length).toBeGreaterThan(0);
            expect(mode.getZones().every(z => z.getData('value') === null)).toBe(true);
            enter();
            scene.advance(1000);
            expect(calls).toEqual([{ ok: true, answer: 'number-match', x: 640, y: 450 }]);
            expect(mode.clearedNumbers.size).toBe(2);
        });

        it('ignores extra drops while the correct answer is being celebrated', async () => {
            await setup({ required: 1, numbers: '34' });
            enter();
            const before = scene.liveObjects().length;
            // Try to overwrite the answer and re-trigger the check
            drop(9, mode.onesZone);
            drop(9, mode.tensZone);
            expect(mode.onesZone.getData('label').text).toBe('4');
            expect(mode.correctInRow).toBe(1);
            scene.advance(5000);
            expect(calls).toHaveLength(1);
            expect(scene.liveObjects().length).toBeLessThanOrEqual(before);
        });

        it('snaps the box back even when the drop is ignored', async () => {
            await setup({ required: 2, numbers: '34' });
            enter();
            const box = boxFor(9);
            drop(9, mode.onesZone);
            scene.advance(300);
            expect(box.x).toBe(box.getData('startX'));
            expect(box.getData('text').x).toBe(box.getData('startX'));
        });

        it('only loads one next challenge after a correct answer', async () => {
            await setup({ required: 2, numbers: '34, 456' });
            enter();
            drop(1, mode.onesZone);
            drop(2, mode.onesZone);
            scene.advance(1000);
            const t = scene.time.now;
            scene.advance(5000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.findTexts('🔊')).toHaveLength(1);
        });

        it('resets progress and streak on a wrong answer, reveals the answer, then lets the child retry', async () => {
            await setup({ required: 2, numbers: '456' });
            incrementStreak();
            enter();
            scene.advance(1000);
            expect(mode.correctInRow).toBe(1);

            enter(true);
            expect(mode.correctInRow).toBe(0);
            expect(getStreak()).toBe(0);
            expect(mode.isRevealing).toBe(true);
            expect(mode.ballIndicators.every(b => b.fillColor === 0xffffff)).toBe(true);

            // The answer is revealed in gold after the shake
            scene.advance(500);
            expect(mode.onesZone.getData('label').text).toBe('6');
            expect(mode.tensZone.getData('label').text).toBe('5');
            expect(mode.hundredsZone.getData('label').text).toBe('4');

            // Drops during the reveal are ignored
            drop(1, mode.onesZone);
            expect(mode.onesZone.getData('label').text).toBe('6');
            expect(calls).toHaveLength(0);

            // Then everything is cleared and the same number is asked again
            scene.advance(1500);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.currentNumber).toBe(456);
            expect(mode.getZones().every(z => z.getData('value') === null)).toBe(true);
            expect(mode.getZones().every(z => z.getData('label').text === '')).toBe(true);
            expect(mode.getZones().every(z => z.scaleX === 1)).toBe(true);

            enter();
            expect(mode.correctInRow).toBe(1);
            scene.advance(1000);
            enter();
            scene.advance(1000);
            expect(calls).toHaveLength(1);
        });

        it('tracks a zero in the hundreds place for numbers like 1034', async () => {
            await setup({ required: 1, numbers: '1034' });
            enter(true);
            scene.advance(500);
            expect(mode.hundredsZone.getData('label').text).toBe('0');
            scene.advance(1500);
            enter();
            scene.advance(1000);
            expect(calls).toHaveLength(1);
        });
    });

    describe('cleanup', () => {
        it('leaves nothing behind when torn down mid wrong-answer feedback', async () => {
            await setup({ required: 2, numbers: '456' });
            enter(true);
            scene.advance(100); // mid-shake
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene.playingSounds()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('leaves nothing behind when torn down right after a correct answer', async () => {
            await setup({ required: 2, numbers: '456' });
            enter();
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('cancels the pending remainder audio when cleaned up mid-stitch', async () => {
            await setup({ required: 1, numbers: '456' });
            mode.cleanup(scene);
            scene.advance(5000);
            expect(scene.playedAudio()).toEqual(['number_audio_400']);
            expect(scene.sound.sounds).toEqual([]);
        });
    });
});
