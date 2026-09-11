import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { LetterListeningMode } from '../../src/pokeballGameModes/LetterListeningMode.js';
import { CONFUSABLE_LETTERS } from '../../src/adaptive.js';
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
function partnersOf(letter) {
    const up = letter.toUpperCase();
    return CONFUSABLE_LETTERS.flatMap(([a, b]) => (a === up ? [b] : b === up ? [a] : []));
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

    it('always offers a confusable partner (b next to d) among the choices', () => {
        let checked = 0;
        for (let i = 0; i < 200; i++) {
            mode.generateChallenge();
            const { correctLetter, letters } = mode.challengeData;
            const partners = partnersOf(correctLetter).filter(p => mode.availableLetters.some(l => l.toUpperCase() === p));
            if (partners.length === 0) continue;
            checked++;
            expect(letters.some(l => partners.includes(l.toUpperCase()))).toBe(true);
            expect(letters).not.toContain(undefined);
        }
        expect(checked).toBeGreaterThan(0);
    });

    it('plays the letter audio on start and on the speaker button', () => {
        const key = `letter_audio_${mode.challengeData.correctLetter.toLowerCase()}`;
        expect(scene.playedAudio()).toEqual([key]);
        scene.click(scene.findText('🔊'));
        expect(scene.playedAudio()).toEqual([key, key]);
    });

    it('shows progress balls with a gift', () => {
        expect(mode.progressBalls.circles).toHaveLength(3);
        expect(scene.findText('🎁')).not.toBeNull();
        scene.click(correctButton(scene, mode));
        expect(mode.progressBalls.circles[0].fillColor).toBe(0x27AE60);
        expect(mode.progressBalls.circles[1].fillColor).toBe(0xFFFFFF);
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

    it('speaks the correct letter during the reveal and re-asks it next', () => {
        const missed = mode.challengeData.correctLetter;
        const key = `letter_audio_${missed.toLowerCase()}`;
        const wrong = wrongButton(scene, mode);
        const wrongX = wrong.x;
        scene.click(wrong);
        scene.advance(450); // shake over, reveal started
        expect(scene.lastAudio()).toBe(key);
        const revealed = mode.letterButtons.find(item => item.letter === missed).button;
        expect(revealed.fillColor).toBe(0xFFD700);
        expect(revealed.input.enabled).toBe(false);
        expect(wrong.x).toBe(wrongX); // shake restored x
        scene.advance(2100);
        // The missed letter comes straight back...
        expect(mode.challengeData.correctLetter).toBe(missed);
        expect(scene.lastAudio()).toBe(key);
        // ...and once more after one other letter
        scene.click(correctButton(scene, mode));
        scene.advance(1000);
        const other = mode.challengeData.correctLetter;
        expect(other).not.toBe(missed);
        scene.click(correctButton(scene, mode));
        scene.advance(1000);
        expect(mode.challengeData.correctLetter).toBe(missed);
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
        scene.click(wrongButton(scene, mode));
        scene.advance(5000);
        expect(scene._missingAudio).toEqual([]);
    });
});
