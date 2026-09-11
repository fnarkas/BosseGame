import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene } from '../helpers/fakeScene.js';
import { BasePokeballGameMode } from '../../src/pokeballGameModes/BasePokeballGameMode.js';
import { COLORS, heartsString, createProgressBalls } from '../../src/pokeballGameModes/uiKit.js';
import { incrementStreak, getStreak } from '../../src/streak.js';

// A minimal concrete mode so the base helpers can be exercised.
class ToyMode extends BasePokeballGameMode {
    constructor() { super(); this.built = 0; this.target = 'a'; }
    generateChallenge() { this.target = this.takeRetry() ?? 'a'; this.challengeData = { target: this.target }; return this.challengeData; }
    createChallengeUI(scene) {
        this.inputLocked = false;
        this.built++;
        this.button = scene.add.rectangle(100, 100, 50, 50, 0xffffff);
        this.button.setInteractive();
        this.uiElements.push(this.button);
    }
}

describe('BasePokeballGameMode helpers', () => {
    let scene, mode;
    beforeEach(() => {
        scene = new FakeScene();
        mode = new ToyMode();
        mode.generateChallenge();
        mode.createChallengeUI(scene);
    });

    it('playAudio never throws on an unknown key and tracks known ones', () => {
        expect(mode.playAudio(scene, 'no_such_key')).toBeNull();
        const s = mode.playAudio(scene, 'letter_audio_a');
        expect(s).toBeTruthy();
        expect(scene.playedAudio()).toEqual(['letter_audio_a']);
        mode.stopAudio();
        expect(mode.activeSounds).toEqual([]);
    });

    it('playSequence plays keys back to back and is cancelled by cleanup', () => {
        mode.playSequence(scene, ['number_audio_200', 'number_audio_45']);
        expect(scene.playedAudio()).toEqual(['number_audio_200']);
        scene.advance(600);
        expect(scene.playedAudio()).toEqual(['number_audio_200', 'number_audio_45']);

        mode.playSequence(scene, ['number_audio_1', 'number_audio_2']);
        mode.cleanup(scene);
        scene.advance(5000);
        expect(scene.playedAudio()).toEqual(['number_audio_200', 'number_audio_45', 'number_audio_1']);
    });

    it('retry queue re-asks a missed item now or after N others', () => {
        mode.queueRetry('b');
        mode.queueRetry('c', 2);
        expect(mode.takeRetry()).toBe('b');        // 1st other item
        expect(mode.takeRetry()).toBeUndefined();  // 2nd other item (a fresh pick)
        expect(mode.takeRetry()).toBe('c');        // now due
        expect(mode.takeRetry()).toBeUndefined();
    });

    it('shakeWrong flashes red, restores the button and calls back', () => {
        let done = false;
        mode.shakeWrong(scene, mode.button, { onComplete: () => { done = true; } });
        expect(mode.button.fillColor).toBe(COLORS.WRONG);
        scene.advance(1000);
        expect(done).toBe(true);
        expect(mode.button.x).toBe(100);
        expect(mode.button.fillColor).toBe(COLORS.NEUTRAL_FILL);
    });

    it('revealAnswer speaks the answer, locks input, then rebuilds and resets the streak', () => {
        incrementStreak();
        mode.queueRetry('z');
        mode.revealAnswer(scene, { targets: [mode.button], disable: [mode.button], audioKey: 'letter_audio_z' });
        expect(mode.isInputBlocked()).toBe(true);
        expect(mode.button.input.enabled).toBe(false);
        expect(scene.lastAudio()).toBe('letter_audio_z');
        expect(mode.button.fillColor).toBe(COLORS.REVEAL);
        scene.advance(2100);
        expect(mode.built).toBe(2);
        expect(mode.target).toBe('z'); // the retry queue fed the next challenge
        expect(mode.isInputBlocked()).toBe(false);
        expect(getStreak()).toBe(0);
    });

    it('revealAnswer can keep the streak and run a custom continuation', () => {
        incrementStreak();
        let custom = false;
        mode.revealAnswer(scene, { targets: mode.button, delay: 500, onDone: () => { custom = true; } });
        scene.advance(600);
        expect(custom).toBe(true);
        expect(mode.built).toBe(1);
        expect(getStreak()).toBe(1);
    });

    it('speaker button plays on tap and squashes briefly', () => {
        let plays = 0;
        const btn = mode.createSpeakerButton(scene, 640, 200, () => plays++);
        scene.click(btn);
        expect(plays).toBe(1);
        scene.advance(150);
        expect(btn.scaleX).toBe(1);
        expect(mode.uiElements).toContain(btn);
    });

    it('progress balls and hearts are tracked and update in place', () => {
        const balls = mode.createProgressBalls(scene, { total: 3, completed: 1, y: 300 });
        expect(balls.circles).toHaveLength(3);
        expect(balls.circles[0].fillColor).toBe(COLORS.CORRECT);
        expect(balls.circles[1].fillColor).toBe(COLORS.NEUTRAL_FILL);
        mode.updateProgressBalls(2);
        expect(balls.circles[1].fillColor).toBe(COLORS.CORRECT);
        const hearts = mode.createHearts(scene, { max: 3, remaining: 3 });
        mode.updateHearts(1);
        expect(hearts.text.text).toBe('❤️🖤🖤');
        mode.cleanup(scene);
        expect(scene.liveObjects()).toEqual([]);
    });

    it('success particles are destroyed on their own and by cleanup', () => {
        mode.showSuccessParticles(scene, 10, 10);
        expect(scene.liveObjectsOfType('ParticleEmitter').length).toBe(1);
        scene.advance(800);
        expect(scene.liveObjectsOfType('ParticleEmitter').length).toBe(0);
        mode.showSuccessParticles(scene, 10, 10);
        mode.cleanup(scene);
        expect(scene.liveObjectsOfType('ParticleEmitter').length).toBe(0);
    });
});

describe('uiKit', () => {
    it('heartsString clamps out-of-range values', () => {
        expect(heartsString(3, 3)).toBe('❤️❤️❤️');
        expect(heartsString(3, -2)).toBe('🖤🖤🖤');
        expect(heartsString(3, 9)).toBe('❤️❤️❤️');
        expect(heartsString(-1, 1)).toBe('');
    });

    it('createProgressBalls centres the whole row including the gift', () => {
        const scene = new FakeScene();
        const balls = createProgressBalls(scene, { total: 3, y: 100, spacing: 60 });
        const xs = balls.circles.map(c => c.x);
        const gift = balls.elements[balls.elements.length - 1];
        const centre = (xs[0] + gift.x) / 2;
        expect(centre).toBeCloseTo(scene.cameras.main.width / 2);
        expect(xs[1] - xs[0]).toBe(60);
    });
});
