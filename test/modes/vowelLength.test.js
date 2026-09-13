import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { assetFileExists } from '../helpers/assets.js';
import { VowelLengthMode, splitPair } from '../../src/pokeballGameModes/VowelLengthMode.js';
import { VOWEL_PAIRS, getAllVowelWords, firstVowelOf } from '../../src/vowelLengthPairs.js';
import { getStreak, incrementStreak } from '../../src/streak.js';
import { getGameModeMistakes } from '../../src/wrongAnswers.js';

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö'];

// Index of the card that answers the current question. Long is always the
// left card (index 0), in both the spelling and the consonant round.
function correctIndex(mode) {
    return mode.challengeData.targetIsLong ? 0 : 1;
}
const cards = (mode) => mode.optionButtons.map(b => b.card);
const correctCard = (mode) => cards(mode)[correctIndex(mode)];
const wrongCard = (mode) => cards(mode)[1 - correctIndex(mode)];
const listenBadges = (scene) => scene.findTexts(t => t.text === '🔊' && t.y !== 190);

// Time for the feedback + reveal + "next question" pause, with margin.
const NEXT_QUESTION_MS = 3000;

describe('VowelLengthMode', () => {
    let scene, mode, calls;

    beforeEach(async () => {
        scene = new FakeScene();
        mode = new VowelLengthMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    describe('splitPair', () => {
        it('splits at the vowel so ck / kk pairs work', () => {
            expect(splitPair('tak', 'tack')).toEqual({ stem: 'ta', longCluster: 'k', shortCluster: 'ck', tail: '' });
            expect(splitPair('vila', 'villa')).toEqual({ stem: 'vi', longCluster: 'l', shortCluster: 'll', tail: 'a' });
            expect(splitPair('glas', 'glass')).toEqual({ stem: 'gla', longCluster: 's', shortCluster: 'ss', tail: '' });
        });

        it('rebuilds both members of every pair from its parts', () => {
            for (const pair of VOWEL_PAIRS) {
                const p = splitPair(pair.long, pair.short);
                expect(p.stem + p.longCluster + p.tail).toBe(pair.long);
                expect(p.stem + p.shortCluster + p.tail).toBe(pair.short);
                expect(p.longCluster.length).toBeGreaterThan(0);
                expect(p.shortCluster.length).toBeGreaterThan(p.longCluster.length);
            }
        });
    });

    describe('challenge generation', () => {
        it('always picks a real pair, a target from it and the round matching the progress', () => {
            for (let i = 0; i < 300; i++) {
                mode.correctCount = i % 3;
                const c = mode.generateChallenge();
                expect(VOWEL_PAIRS).toContain(c.pair);
                expect([c.pair.long, c.pair.short]).toContain(c.target);
                expect(c.targetIsLong).toBe(c.target === c.pair.long);
                // Two task types alternate: spelling, consonants, spelling, ...
                expect(mode.roundType).toBe((i % 3) % 2);
            }
        });

        it('keeps the same pair for the whole round and picks a fresh one for the next', () => {
            const seen = new Set();
            for (let round = 0; round < 40; round++) {
                mode.correctCount = 0;
                const first = mode.generateChallenge().pair;
                seen.add(first);
                mode.correctCount = 1;
                expect(mode.generateChallenge().pair).toBe(first);
                mode.correctCount = 2;
                expect(mode.generateChallenge().pair).toBe(first);
            }
            // The pair is drawn at random from the whole list
            expect(seen.size).toBeGreaterThan(5);
        });

        it('asks for both the long and the short form over many draws', () => {
            const longs = new Set();
            for (let i = 0; i < 100; i++) longs.add(mode.generateChallenge().targetIsLong);
            expect(longs).toEqual(new Set([true, false]));
        });
    });

    describe('audio', () => {
        it('has audio loaded and on disk for every word in the pairs and every vowel length', () => {
            for (const word of getAllVowelWords()) {
                expect(scene.cache.audio.exists(`word_audio_${word}`), word).toBe(true);
                expect(assetFileExists(`word_audio/${word}.mp3`), word).toBe(true);
            }
            for (const v of VOWELS) {
                for (const len of ['long', 'short']) {
                    expect(scene.cache.audio.exists(`vowel_audio_${v}_${len}`)).toBe(true);
                    expect(assetFileExists(`vowel_audio/${v}_${len}.mp3`)).toBe(true);
                }
            }
            // Every pair's vowel has isolated sound files
            for (const pair of VOWEL_PAIRS) expect(VOWELS).toContain(firstVowelOf(pair.long));
        });

        it('plays the target word shortly after the question appears and on the speaker', () => {
            expect(scene.playedAudio()).toEqual([]);
            scene.advance(300);
            const key = `word_audio_${mode.challengeData.target}`;
            expect(scene.playedAudio()).toEqual([key]);
            scene.click(scene.findText('🔊'));
            expect(scene.playedAudio()).toEqual([key, key]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('never overlaps two sounds: a new tap stops the previous one', () => {
            scene.advance(300);
            scene.click(scene.findText('🔊'));
            scene.click(scene.findText('🔊'));
            expect(scene.playingSounds()).toHaveLength(1);
        });

        it('the listen badges play the isolated vowel, long on the left and short on the right', () => {
            const vowel = firstVowelOf(mode.challengeData.pair.long);
            const badges = listenBadges(scene);
            expect(badges).toHaveLength(2);
            scene.click(badges[0]);
            expect(scene.lastAudio()).toBe(`vowel_audio_${vowel}_long`);
            scene.click(badges[1]);
            expect(scene.lastAudio()).toBe(`vowel_audio_${vowel}_short`);
        });
    });

    describe('spelling round (round 0)', () => {
        it('shows the two spellings, long on the left, with no word drawn yet', () => {
            expect(mode.roundType).toBe(0);
            const labels = mode.optionButtons.map(b => b.text.text);
            expect(labels).toEqual([mode.challengeData.pair.long.toUpperCase(), mode.challengeData.pair.short.toUpperCase()]);
            expect(mode.letterObjects).toEqual([]);
            expect(scene.interactives()).toContain(correctCard(mode));
        });

        it('shows one progress ball per required answer plus the gift', () => {
            expect(mode.progressBalls.circles).toHaveLength(mode.requiredCorrect);
            expect(mode.progressBalls.circles.every(b => b.fillColor === 0xffffff)).toBe(true);
            expect(scene.findText('🎁')).toBeTruthy();
        });
    });

    describe('answering', () => {
        it('reveals the word with a tappable vowel after a correct answer and fills a ball', () => {
            const { target, targetIsLong } = mode.challengeData;
            const vowel = firstVowelOf(target);
            scene.click(correctCard(mode));
            expect(mode.correctCount).toBe(1);
            expect(mode.progressBalls.circles[0].fillColor).toBe(0x27AE60);
            expect(scene.lastAudio()).toBe(`word_audio_${target}`);
            // Spelled out, uppercase
            expect(mode.letterObjects.map(l => l.text.text).join('')).toBe(target.toUpperCase());
            const vowelLetter = mode.letterObjects.find(l => l.isVowel);
            expect(vowelLetter.text.input?.enabled).toBe(true);
            scene.click(vowelLetter.text);
            expect(scene.lastAudio()).toBe(`vowel_audio_${vowel}_${targetIsLong ? 'long' : 'short'}`);
            // Cards are dead during the reveal
            cards(mode).forEach(c => expect(c.input.enabled).toBe(false));
        });

        it('alternates the two task types on the same pair and rewards exactly once', () => {
            const pair = mode.challengeData.pair;
            const rounds = [];
            for (let i = 0; i < 3; i++) {
                rounds.push(mode.roundType);
                expect(mode.challengeData.pair).toBe(pair);
                scene.click(correctCard(mode));
                scene.advance(NEXT_QUESTION_MS);
            }
            expect(rounds).toEqual([0, 1, 0]);
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            expect([pair.long, pair.short]).toContain(calls[0].answer);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._missingAudio).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('never asks the old judge question: no ✅/❌ cards in any round', () => {
            for (let i = 0; i < 3; i++) {
                expect(mode.optionButtons.map(b => b.text.text)).not.toContain('✅');
                // Vowel is not tappable while the question is open (it would give the answer away)
                const vowel = mode.letterObjects.find(l => l.isVowel);
                if (vowel) expect(vowel.text.input).toBeFalsy();
                scene.click(correctCard(mode));
                scene.advance(NEXT_QUESTION_MS);
            }
        });

        it('consonant round: word with a gap, one or two consonants to choose from', () => {
            scene.click(correctCard(mode));
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.roundType).toBe(1);
            const { parts, target } = mode.challengeData;
            expect(scene.lastAudio()).toBe(`word_audio_${target}`);
            expect(mode.letterObjects.map(l => l.text.text).join('')).toBe((parts.stem + parts.tail).toUpperCase());
            // One slot more than there are letters: the gap
            const gapBoxes = scene.liveObjectsOfType('Rectangle').filter(r => r.y === 350 && r.width === 64);
            expect(gapBoxes).toHaveLength(1);
            expect(mode.optionButtons.map(b => b.text.text)).toEqual([parts.longCluster.toUpperCase(), parts.shortCluster.toUpperCase()]);
        });

        it('keeps progress but resets the streak and moves on after a wrong answer', () => {
            incrementStreak();
            incrementStreak();
            const { target } = mode.challengeData;
            scene.click(wrongCard(mode));
            expect(mode.correctCount).toBe(0);
            const mistakes = getGameModeMistakes('VowelLengthMode');
            expect(Object.keys(mistakes)).toHaveLength(1);
            scene.advance(NEXT_QUESTION_MS);
            expect(calls).toHaveLength(0);
            // The streak is reset when the next question is built
            expect(getStreak()).toBe(0);
            // The reveal happened (word spelled out) and then a new question is up
            expect(mode.roundType).toBe(0);
            expect(mode.isRevealing).toBe(false);
            expect(cards(mode)).toHaveLength(2);
            cards(mode).forEach(c => expect(c.input.enabled).toBe(true));
            expect(scene._useAfterDestroy).toEqual([]);
            // The missed question is asked again, exactly as it was
            expect(mode.challengeData.target).toBe(target);
        });

        it('re-asks a missed question straight away and once more two questions later', () => {
            const { target } = mode.challengeData;
            scene.click(wrongCard(mode));
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.roundType).toBe(0);
            expect(mode.challengeData.target).toBe(target);
            scene.click(correctCard(mode));
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.roundType).toBe(1);
            scene.click(correctCard(mode));
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.roundType).toBe(0);
            // Same pair and length as the missed question, asked a third time
            expect(mode.challengeData.target).toBe(target);
        });

        it('keeps the streak after a correct answer', () => {
            incrementStreak();
            scene.click(correctCard(mode));
            scene.advance(NEXT_QUESTION_MS);
            expect(getStreak()).toBe(1);
        });

        it('shows and speaks the correct word after a miss, then the vowel on its own', () => {
            const { target, targetIsLong } = mode.challengeData;
            const vowel = firstVowelOf(target);
            scene.click(wrongCard(mode));
            scene.advance(400); // shake done
            expect(mode.letterObjects.map(l => l.text.text).join('')).toBe(target.toUpperCase());
            expect(scene.lastAudio()).toBe(`word_audio_${target}`);
            scene.advance(600); // the word (0.5s) has finished
            expect(scene.lastAudio()).toBe(`vowel_audio_${vowel}_${targetIsLong ? 'long' : 'short'}`);
            expect(scene._missingAudio).toEqual([]);
        });

        it('never shows status or instruction text, only the learning content', () => {
            const learning = new Set([...getAllVowelWords().map(w => w.toUpperCase()), '✅', '❌', '🔊', '🎁']);
            const check = () => scene.liveTexts().forEach(t => {
                expect(/[a-zåäö]{3,} [a-zåäö]/i.test(t.text), t.text).toBe(false);
                expect(t.text.length <= 2 || learning.has(t.text), t.text).toBe(true);
            });
            check();
            scene.click(wrongCard(mode));
            scene.advance(400);
            check();
            scene.advance(NEXT_QUESTION_MS);
            check();
        });

        it('can be won after a miss', () => {
            scene.click(wrongCard(mode));
            scene.advance(NEXT_QUESTION_MS);
            for (let i = 0; i < 3; i++) {
                scene.click(correctCard(mode));
                scene.advance(NEXT_QUESTION_MS);
            }
            expect(calls).toHaveLength(1);
        });
    });

    describe('lockout', () => {
        it('counts a double tap on the correct card once', () => {
            const c = correctCard(mode);
            scene.click(c);
            scene.click(c);
            scene.click(c, { force: true });
            expect(mode.correctCount).toBe(1);
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.correctCount).toBe(1);
            expect(mode.roundType).toBe(1);
            // Exactly one "next question" was built
            expect(cards(mode)).toHaveLength(2);
            expect(scene.liveTexts().filter(t => t.text === '🎁')).toHaveLength(1);
        });

        it('ignores the correct card while a wrong answer is being shaken and revealed', () => {
            scene.click(wrongCard(mode));
            scene.click(correctCard(mode), { force: true });
            scene.advance(150);
            scene.click(correctCard(mode), { force: true });
            scene.advance(800);
            scene.click(correctCard(mode), { force: true });
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.correctCount).toBe(0);
            expect(calls).toHaveLength(0);
            expect(scene.liveTexts().filter(t => t.text === '🎁')).toHaveLength(1);
        });

        it('does not fire the reward twice when the last card is tapped repeatedly', () => {
            for (let i = 0; i < 2; i++) {
                scene.click(correctCard(mode));
                scene.advance(NEXT_QUESTION_MS);
            }
            const c = correctCard(mode);
            scene.click(c);
            scene.click(c, { force: true });
            scene.advance(NEXT_QUESTION_MS);
            expect(calls).toHaveLength(1);
        });
    });

    describe('cleanup', () => {
        it('mid-shake: leaves no orphaned UI, timers, tweens or late callbacks', () => {
            scene.click(wrongCard(mode));
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene.playingSounds()).toEqual([]);
        });

        it('mid-reveal after a correct answer: nothing comes back', () => {
            scene.click(correctCard(mode));
            scene.advance(300);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('right after the speaker was tapped: no setScale on a destroyed speaker', () => {
            scene.click(scene.findText('🔊'));
            mode.cleanup(scene);
            scene.advance(1000);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });

    describe('config', () => {
        it('reads required and showListenHelp from the vowelLength section', async () => {
            setTestConfig({ vowelLength: { required: 5, showListenHelp: false } });
            const s = new FakeScene();
            const m = new VowelLengthMode();
            await startMode(m, s);
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(5);
            expect(m.showListenHelp).toBe(false);
            expect(m.progressBalls.circles).toHaveLength(5);
            expect(listenBadges(s)).toHaveLength(0);
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ vowelLength: undefined });
            const m = new VowelLengthMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(3);
            expect(m.showListenHelp).toBe(true);
        });

        it('plays all rounds of a longer game on one pair without missing audio', async () => {
            setTestConfig({ vowelLength: { required: 6 } });
            for (let game = 0; game < 10; game++) {
                const s = new FakeScene();
                const m = new VowelLengthMode();
                const c = [];
                m.setAnswerCallback((ok) => c.push(ok));
                await startMode(m, s);
                for (let i = 0; i < 6; i++) {
                    if (i % 2 === 0) { s.click(wrongCard(m)); s.advance(NEXT_QUESTION_MS); }
                    s.click(correctCard(m));
                    s.advance(NEXT_QUESTION_MS);
                }
                expect(c).toEqual([true]);
                expect(s._missingAudio).toEqual([]);
                expect(s._useAfterDestroy).toEqual([]);
                m.cleanup(s);
                expect(s.liveObjects()).toEqual([]);
            }
        });
    });
});
