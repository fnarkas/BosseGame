import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { NumberBondsMode } from '../../src/pokeballGameModes/NumberBondsMode.js';

describe('NumberBondsMode', () => {
    let scene, mode, calls;
    const keyFor = (value) => mode.keyButtons.find(k => k.value === value).rect;

    beforeEach(async () => {
        setTestConfig({ numberBonds: { sum: 10, durationSeconds: 10, targetCount: 5, maxCoins: 100, showTenFrame: true } });
        scene = new FakeScene();
        mode = new NumberBondsMode();
        calls = [];
        mode.setAnswerCallback((ok, answer) => calls.push({ ok, answer }));
        await startMode(mode, scene);
    });

    it('loads its config and shows a keypad from 0 to the sum', () => {
        expect(mode.targetCount).toBe(5);
        expect(mode.keyButtons.map(k => k.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(mode.frameSlots).toHaveLength(10);
        expect(mode.problemText.text).toBe(`${mode.challengeData.given} + ? = 10`);
    });

    it('only shows the given number of balls before answering', () => {
        const visible = mode.frameSlots.filter(s => s.ball.visible).length;
        expect(visible).toBe(mode.challengeData.given);
    });

    it('ends early with the full reward once the target is reached', () => {
        for (let i = 0; i < 5; i++) {
            scene.click(keyFor(mode.challengeData.answer));
            scene.advance(400);
        }
        expect(mode.earnedCoins).toBe(100);
        scene.advance(1000);
        expect(calls).toEqual([{ ok: true, answer: expect.any(Number) }]);
    });

    it('keeps the same problem after a wrong key and never repeats the given number back to back', () => {
        const given = mode.challengeData.given;
        scene.click(keyFor((mode.challengeData.answer + 1) % 11));
        scene.advance(300);
        expect(mode.challengeData.given).toBe(given);
        expect(mode.correctCount).toBe(0);
        scene.click(keyFor(mode.challengeData.answer));
        scene.advance(400);
        expect(mode.challengeData.given).not.toBe(given);
    });

    it('finishes when the clock runs out and pays for what was done', () => {
        scene.click(keyFor(mode.challengeData.answer));
        scene.advance(400);
        scene.advance(10000);
        expect(mode.gameActive).toBe(false);
        expect(mode.earnedCoins).toBe(mode.coinsForCount(1));
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        // Keys are dead after the game ended
        scene.click(keyFor(mode.challengeData.answer));
        expect(mode.correctCount).toBe(1);
    });

    it('cleans up the timer and UI', () => {
        mode.cleanup(scene);
        const t = scene.time.now;
        scene.advance(20000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
        expect(calls).toHaveLength(0);
    });
});
