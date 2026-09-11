import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { LetterListeningMode } from '../../src/pokeballGameModes/LetterListeningMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

function letterButtons(scene) {
    return scene.interactives().filter(o => o.type === 'Rectangle' && o.getData('letter'));
}
function correctButton(scene, mode) {
    return letterButtons(scene).find(b => b.getData('letter') === mode.challengeData.correctLetter);
}
function wrongButton(scene, mode) {
    return letterButtons(scene).find(b => b.getData('letter') !== mode.challengeData.correctLetter);
}

describe('LetterListeningMode', () => {
    let scene, mode, calls;
    beforeEach(async () => {
        scene = new FakeScene();
        mode = new LetterListeningMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    it('builds a challenge with six distinct letters including the answer', () => {
        expect(mode.challengeData.letters).toHaveLength(6);
        expect(new Set(mode.challengeData.letters).size).toBe(6);
        expect(mode.challengeData.letters).toContain(mode.challengeData.correctLetter);
        expect(letterButtons(scene)).toHaveLength(6);
    });

    it('plays the letter audio on start and on the speaker button', () => {
        const key = `letter_audio_${mode.challengeData.correctLetter.toLowerCase()}`;
        expect(scene.playedAudio()).toEqual([key]);
        scene.click(scene.findText('🔊'));
        expect(scene.playedAudio()).toEqual([key, key]);
    });

    it('awards the reward after three correct answers in a row', () => {
        for (let i = 0; i < 3; i++) {
            scene.click(correctButton(scene, mode));
            scene.advance(1000);
        }
        expect(calls).toHaveLength(1);
        expect(calls[0].ok).toBe(true);
    });

    it('ignores extra taps while the next challenge is loading (no double counting)', () => {
        const btn = correctButton(scene, mode);
        scene.click(btn);
        scene.click(btn);
        scene.click(btn);
        scene.advance(1000);
        expect(mode.correctInRow).toBe(1);
        expect(calls).toHaveLength(0);
    });

    it('resets progress and shows a new challenge after a wrong answer', () => {
        incrementStreak();
        scene.click(correctButton(scene, mode));
        scene.advance(1000);
        expect(mode.correctInRow).toBe(1);
        const before = mode.challengeData.correctLetter;
        scene.click(wrongButton(scene, mode));
        scene.advance(5000);
        expect(mode.correctInRow).toBe(0);
        expect(getStreak()).toBe(0);
        expect(calls).toHaveLength(0);
        // A fresh challenge is on screen and interactive
        expect(letterButtons(scene)).toHaveLength(6);
        expect(mode.usedLetters.has(before)).toBe(true);
    });

    it('does not accept a correct tap once a wrong answer is being revealed', () => {
        scene.click(wrongButton(scene, mode));
        // During shake + reveal the correct button must not count
        scene.advance(100);
        scene.click(correctButton(scene, mode));
        scene.advance(5000);
        expect(mode.correctInRow).toBe(0);
        expect(calls).toHaveLength(0);
    });

    it('cleans up everything and leaves no orphaned UI behind', () => {
        scene.click(wrongButton(scene, mode));
        scene.advance(100); // mid-shake
        mode.cleanup(scene);
        const t = scene.time.now;
        scene.advance(10000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('never plays an audio key that BootScene did not load', () => {
        expect(scene._missingAudio).toEqual([]);
    });
});
