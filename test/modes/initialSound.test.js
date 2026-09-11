import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorage } from '../../src/storage.js';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { InitialSoundMode } from '../../src/pokeballGameModes/InitialSoundMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';
import { getGameModeMistakes } from '../../src/wrongAnswers.js';

const cards = (scene) => scene.interactives().filter(o => o.type === 'Rectangle' && o.getData('letter'));
const correctCard = (scene, mode) => cards(scene).find(c => c.getData('letter') === mode.challengeData.targetLetter);
const wrongCard = (scene, mode) => cards(scene).find(c => c.getData('letter') !== mode.challengeData.targetLetter);

describe('InitialSoundMode', () => {
    let scene, mode, calls;
    beforeEach(async () => {
        resetStorage();
        scene = new FakeScene();
        mode = new InitialSoundMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    it('offers four pictures, exactly one starting with the target letter, all different', () => {
        const { targetLetter, options } = mode.challengeData;
        expect(options).toHaveLength(4);
        expect(options.filter(o => o.letter === targetLetter)).toHaveLength(1);
        expect(new Set(options.map(o => o.emoji)).size).toBe(4);
        expect(cards(scene)).toHaveLength(4);
        expect(scene.findText(targetLetter)).toBeTruthy();
    });

    it('speaks the letter at start and on the speaker button', () => {
        const key = `letter_audio_${mode.challengeData.targetLetter.toLowerCase()}`;
        expect(scene.playedAudio()).toEqual([key]);
        scene.click(scene.findText('🔊'));
        expect(scene.playedAudio()).toEqual([key, key]);
    });

    it('rewards after three correct pictures in a row without resetting the streak', () => {
        incrementStreak();
        for (let i = 0; i < 3; i++) {
            scene.click(correctCard(scene, mode));
            scene.advance(1000);
        }
        expect(calls).toHaveLength(1);
        expect(calls[0].ok).toBe(true);
        expect(getStreak()).toBe(1);
    });

    it('ignores extra taps while the next picture set loads', () => {
        const c = correctCard(scene, mode);
        scene.click(c);
        scene.click(c);
        scene.click(c);
        scene.advance(1000);
        expect(mode.correctInRow).toBe(1);
        expect(calls).toHaveLength(0);
    });

    it('on a wrong tap: speaks the letter, tracks the confusion, re-asks the same letter', () => {
        incrementStreak();
        const letter = mode.challengeData.targetLetter;
        const wrong = wrongCard(scene, mode);
        const wrongLetter = wrong.getData('letter');
        scene.click(wrong);
        scene.advance(500); // shake done, reveal started
        expect(scene.lastAudio()).toBe(`letter_audio_${letter.toLowerCase()}`);
        // Every card is disabled during the reveal, so a tap on the right one can't count
        const allCards = scene.liveObjectsOfType('Rectangle').filter(o => o.getData('letter'));
        expect(allCards.every(c => c.input && c.input.enabled === false)).toBe(true);
        scene.advance(5000);
        expect(calls).toHaveLength(0);
        expect(mode.correctInRow).toBe(0);
        expect(getStreak()).toBe(0);
        expect(mode.challengeData.targetLetter).toBe(letter);
        expect(getGameModeMistakes('InitialSoundMode')[`${letter}_vs_${wrongLetter}`]).toBe(1);
    });

    it('cleans up everything and leaves no orphaned UI behind', () => {
        scene.click(wrongCard(scene, mode));
        scene.advance(100);
        mode.cleanup(scene);
        const t = scene.time.now;
        scene.advance(10000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('never plays an audio key that BootScene did not load', () => {
        scene.click(wrongCard(scene, mode));
        scene.advance(6000);
        expect(scene._missingAudio).toEqual([]);
    });
});
