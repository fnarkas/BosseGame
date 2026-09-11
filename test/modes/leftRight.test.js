import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { LeftRightMode } from '../../src/pokeballGameModes/LeftRightMode.js';
import { incrementStreak, getStreak } from '../../src/streak.js';

describe('LeftRightMode', () => {
    let scene, mode, calls;
    const zone = (dir) => (dir === 'vanster' ? mode.leftZone : mode.rightZone);
    const other = (dir) => (dir === 'vanster' ? 'hoger' : 'vanster');
    const correctZone = () => zone(mode.challengeData.correctDirection);
    const wrongZone = () => zone(other(mode.challengeData.correctDirection));

    beforeEach(async () => {
        scene = new FakeScene();
        mode = new LeftRightMode();
        calls = [];
        mode.setAnswerCallback((ok, answer) => calls.push({ ok, answer }));
        await startMode(mode, scene);
    });

    it('plays the direction audio and has the left zone left of the right zone', () => {
        expect(scene.lastAudio()).toBe(`direction_audio_${mode.challengeData.correctDirection}`);
        expect(mode.leftZone.x).toBeLessThan(mode.rightZone.x);
        scene.click(scene.findText('🔊'));
        expect(scene.playedAudio()).toHaveLength(2);
    });

    it('shows one progress ball per required answer, centred with the gift', () => {
        expect(mode.progressBalls.circles).toHaveLength(mode.requiredCorrect);
        const gift = scene.findText('🎁');
        const xs = mode.progressBalls.circles.map(c => c.x);
        expect((xs[0] + gift.x) / 2).toBeCloseTo(scene.cameras.main.width / 2);
        mode.progressBalls.circles.forEach(c => expect(c.y).toBe(500));
    });

    it('needs six correct answers for the reward', () => {
        for (let i = 0; i < 6; i++) {
            expect(calls).toHaveLength(0);
            scene.click(correctZone());
            scene.advance(800);
        }
        expect(calls).toEqual([{ ok: true, answer: expect.any(String) }]);
    });

    it('counts a rapid double tap only once', () => {
        const z = correctZone();
        scene.click(z);
        scene.click(z);
        scene.advance(800);
        expect(mode.correctInRow).toBe(1);
        expect(mode.progressBalls.circles[0].fillColor).toBe(0x27AE60);
    });

    it('restarts the scene after a wrong answer and resets the streak', () => {
        incrementStreak();
        scene.click(correctZone());
        scene.advance(800);
        scene.click(wrongZone());
        scene.advance(100);
        scene.click(correctZone()); // ignored during feedback
        scene.advance(5000);
        expect(getStreak()).toBe(0);
        expect(calls).toHaveLength(0);
        expect(scene.sceneCalls).toEqual([{ method: 'restart', data: undefined }]);
        expect(scene.liveObjects()).toEqual([]);
    });

    it('lights up and speaks the correct side after a wrong tap, then asks it again', () => {
        const missed = mode.challengeData.correctDirection;
        const wrong = wrongZone();
        const wrongX = wrong.x;
        scene.click(wrong);
        expect(wrong.fillColor).toBe(0xFF0000);
        scene.advance(450); // shake over
        expect(wrong.x).toBe(wrongX);
        expect(wrong.fillColor).toBe(0xFFFFFF);
        expect(correctZone().fillColor).toBe(0xFFD700);
        expect(scene.lastAudio()).toBe(`direction_audio_${missed}`);
        expect(scene.findText('😢')).not.toBeNull();
        scene.advance(5000);
        expect(scene.sceneCalls).toHaveLength(1);
        mode.generateChallenge();
        expect(mode.challengeData.correctDirection).toBe(missed);
    });

    it('cleans up audio and UI', () => {
        scene.click(correctZone());
        mode.cleanup(scene);
        const t = scene.time.now;
        scene.advance(10000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.playingSounds()).toEqual([]);
    });

    it('never plays an audio key that BootScene did not load', () => {
        scene.click(wrongZone());
        scene.advance(5000);
        expect(scene._missingAudio).toEqual([]);
    });
});
