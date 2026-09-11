import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { VowelSoundsMode, STAGE_SOUNDS, STAGE_LETTERS, STAGE_MIXED } from '../../src/pokeballGameModes/VowelSoundsMode.js';
import { splitPair } from '../../src/pokeballGameModes/VowelLengthMode.js';
import { VOWEL_PAIRS, firstVowelOf } from '../../src/vowelLengthPairs.js';
import { getStreak, incrementStreak } from '../../src/streak.js';
import { getGameModeMistakes } from '../../src/wrongAnswers.js';

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö'];
const ROUND_SOUND = 0;
const ROUND_LETTERS = 1;

// Long is always the left card in both rounds.
const cards = (mode) => mode.optionButtons.map(b => b.card);
const correctCard = (mode) => cards(mode)[mode.challengeData.targetIsLong ? 0 : 1];
const wrongCard = (mode) => cards(mode)[mode.challengeData.targetIsLong ? 1 : 0];
const speaker = (scene) => scene.findText(t => t.text === '🔊' && t.y === 190);
const listenBadges = (scene) => scene.findTexts(t => t.text === '🔊' && t.y !== 190);
const vowelKey = (mode) => `vowel_audio_${mode.challengeData.vowel}_${mode.challengeData.targetIsLong ? 'long' : 'short'}`;

const NEXT_QUESTION_MS = 3000;

async function start(stage, extra = {}) {
    setTestConfig({ vowelSounds: { required: 4, stage, showListenHelp: true, ...extra } });
    const scene = new FakeScene();
    const mode = new VowelSoundsMode();
    const calls = [];
    mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
    await startMode(mode, scene);
    return { scene, mode, calls };
}

describe('VowelSoundsMode', () => {
    describe('config', () => {
        it('reads required, stage and showListenHelp', async () => {
            const { mode, scene } = await start(STAGE_LETTERS, { required: 2, showListenHelp: false });
            expect(mode.configLoaded).toBe(true);
            expect(mode.requiredCorrect).toBe(2);
            expect(mode.stage).toBe(STAGE_LETTERS);
            expect(mode.showListenHelp).toBe(false);
            expect(mode.ballIndicators).toHaveLength(2);
            expect(listenBadges(scene)).toHaveLength(0);
        });

        it('ignores an unknown stage and a missing section', async () => {
            const { mode } = await start('bogus');
            expect(mode.stage).toBe(STAGE_SOUNDS);
            setTestConfig({ vowelSounds: undefined });
            const m = new VowelSoundsMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(4);
            expect(m.stage).toBe(STAGE_SOUNDS);
            expect(m.showListenHelp).toBe(true);
        });
    });

    describe('challenge generation', () => {
        it('sounds stage: always a sound round on one of the nine vowels, both lengths', async () => {
            const { mode } = await start(STAGE_SOUNDS);
            const vowels = new Set();
            const lengths = new Set();
            for (let i = 0; i < 300; i++) {
                mode.correctCount = i % 4;
                const c = mode.generateChallenge();
                expect(mode.roundType).toBe(ROUND_SOUND);
                expect(VOWELS).toContain(c.vowel);
                expect(c.pair).toBeNull();
                vowels.add(c.vowel);
                lengths.add(c.targetIsLong);
            }
            expect(vowels.size).toBe(9);
            expect(lengths.size).toBe(2);
        });

        it('letters stage: always a letters round on a pair whose short form doubles one consonant', async () => {
            const { mode } = await start(STAGE_LETTERS);
            const pairs = new Set();
            for (let i = 0; i < 300; i++) {
                mode.correctCount = i % 4;
                const c = mode.generateChallenge();
                expect(mode.roundType).toBe(ROUND_LETTERS);
                expect(VOWEL_PAIRS).toContain(c.pair);
                expect(c.parts.shortCluster).toBe(c.parts.longCluster + c.parts.longCluster);
                expect(c.target).toBe(c.targetIsLong ? c.pair.long : c.pair.short);
                expect(c.vowel).toBe(firstVowelOf(c.pair.long));
                pairs.add(c.pair);
            }
            // tak/tack-style pairs never appear here
            expect([...pairs].some(p => splitPair(p.long, p.short).shortCluster === 'ck')).toBe(false);
            expect(pairs.size).toBeGreaterThan(5);
        });

        it('mixed stage: alternates sound and letters rounds with progress', async () => {
            const { mode } = await start(STAGE_MIXED);
            for (let i = 0; i < 8; i++) {
                mode.correctCount = i;
                mode.generateChallenge();
                expect(mode.roundType).toBe(i % 2 === 0 ? ROUND_SOUND : ROUND_LETTERS);
            }
        });

        it('does not ask the exact same question twice in a row', async () => {
            const { mode } = await start(STAGE_SOUNDS);
            let prev = mode.generateChallenge();
            for (let i = 0; i < 300; i++) {
                const c = mode.generateChallenge();
                expect(`${c.vowel}_${c.targetIsLong}`).not.toBe(`${prev.vowel}_${prev.targetIsLong}`);
                prev = c;
            }
        });
    });

    describe('sound round', () => {
        let scene, mode, calls;
        beforeEach(async () => ({ scene, mode, calls } = await start(STAGE_SOUNDS)));

        it('plays the vowel after 300ms and on the speaker, and only ever one sound at a time', () => {
            expect(scene.playedAudio()).toEqual([]);
            scene.advance(300);
            expect(scene.playedAudio()).toEqual([vowelKey(mode)]);
            scene.click(speaker(scene));
            scene.click(speaker(scene));
            expect(scene.playedAudio()).toEqual([vowelKey(mode), vowelKey(mode), vowelKey(mode)]);
            expect(scene.playingSounds()).toHaveLength(1);
            expect(scene._missingAudio).toEqual([]);
        });

        it('shows the vowel long on the left card and short on the right, with listen badges', () => {
            expect(cards(mode)).toHaveLength(2);
            const [left, right] = mode.optionButtons.map(b => b.contents[0]);
            expect(left.text).toBe(mode.challengeData.vowel.toUpperCase());
            expect(right.text).toBe(mode.challengeData.vowel.toUpperCase());
            expect(left.scaleX).toBeGreaterThan(1);
            expect(right.scaleX).toBeLessThan(1);
            const badges = listenBadges(scene);
            expect(badges).toHaveLength(2);
            scene.click(badges[0]);
            expect(scene.lastAudio()).toBe(`vowel_audio_${mode.challengeData.vowel}_long`);
            scene.click(badges[1]);
            expect(scene.lastAudio()).toBe(`vowel_audio_${mode.challengeData.vowel}_short`);
            // No word is drawn in the sound round
            expect(mode.wordElements).toEqual([]);
        });

        it('rewards after four correct answers, exactly once', () => {
            for (let i = 0; i < 4; i++) {
                expect(mode.roundType).toBe(ROUND_SOUND);
                scene.click(correctCard(mode));
                expect(mode.correctCount).toBe(i + 1);
                expect(mode.ballIndicators[i].fillColor).toBe(0x27AE60);
                scene.advance(NEXT_QUESTION_MS);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            expect(VOWELS).toContain(calls[0].answer);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._missingAudio).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('reveals the vowel with its sound after an answer and disables the cards', () => {
            scene.click(correctCard(mode));
            expect(scene.lastAudio()).toBe(vowelKey(mode));
            const letter = mode.wordElements.find(o => o.type === 'Text');
            expect(letter.text).toBe(mode.challengeData.vowel.toUpperCase());
            cards(mode).forEach(c => expect(c.input.enabled).toBe(false));
            scene.advance(800); // long: 600ms stretch; short: 180ms yoyo x2 then held squeezed
            if (mode.challengeData.targetIsLong) expect(letter.scaleX).toBeGreaterThan(1);
            else expect(letter.scaleX).toBeLessThan(1);
        });

        it('wrong answer: keeps progress, resets the streak, lights the right card and moves on', () => {
            incrementStreak();
            scene.click(wrongCard(mode));
            expect(getStreak()).toBe(0);
            expect(mode.correctCount).toBe(0);
            expect(Object.keys(getGameModeMistakes('VowelSoundsMode'))).toHaveLength(1);
            scene.advance(450); // shake finished, reveal started
            expect(correctCard(mode).fillColor).toBe(0x27AE60);
            expect(scene.lastAudio()).toBe(vowelKey(mode));
            scene.advance(NEXT_QUESTION_MS);
            expect(calls).toHaveLength(0);
            expect(mode.isRevealing).toBe(false);
            expect(cards(mode)).toHaveLength(2);
            cards(mode).forEach(c => expect(c.input.enabled).toBe(true));
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('lockout: double taps and taps during a wrong reveal are ignored', () => {
            const c = correctCard(mode);
            scene.click(c);
            scene.click(c, { force: true });
            expect(mode.correctCount).toBe(1);
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.correctCount).toBe(1);
            expect(scene.liveTexts().filter(t => t.text === '🎁')).toHaveLength(1);

            scene.click(wrongCard(mode));
            scene.click(correctCard(mode), { force: true });
            scene.advance(200);
            scene.click(correctCard(mode), { force: true });
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.correctCount).toBe(1);
            expect(calls).toHaveLength(0);
            expect(scene.liveTexts().filter(t => t.text === '🎁')).toHaveLength(1);
        });

        it('cleanup mid-flow leaves nothing behind', () => {
            scene.click(wrongCard(mode));
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene.playingSounds()).toEqual([]);
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });

    describe('letters round', () => {
        let scene, mode, calls;
        beforeEach(async () => ({ scene, mode, calls } = await start(STAGE_LETTERS)));

        it('shows the stretched/squeezed vowel and one vs two consonants', () => {
            const { vowel, targetIsLong, parts } = mode.challengeData;
            const stimulus = mode.wordElements.find(o => o.type === 'Text');
            expect(stimulus.text).toBe(vowel.toUpperCase());
            if (targetIsLong) expect(stimulus.scaleX).toBeGreaterThan(1);
            else expect(stimulus.scaleX).toBeLessThan(1);
            scene.click(stimulus);
            expect(scene.lastAudio()).toBe(vowelKey(mode));
            expect(mode.optionButtons.map(b => b.contents[0].text)).toEqual([parts.longCluster.toUpperCase(), parts.shortCluster.toUpperCase()]);
            scene.advance(300);
            expect(scene.playedAudio()).toEqual([vowelKey(mode), vowelKey(mode)]);
        });

        it('spells and reads the whole word on reveal, then rewards after four', () => {
            for (let i = 0; i < 4; i++) {
                const { target } = mode.challengeData;
                scene.click(correctCard(mode));
                expect(scene.lastAudio()).toBe(`word_audio_${target}`);
                expect(mode.letterObjects.map(l => l.text.text).join('')).toBe(target.toUpperCase());
                expect(mode.letterObjects.filter(l => l.isVowel)).toHaveLength(1);
                scene.advance(NEXT_QUESTION_MS);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            expect(scene._missingAudio).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('wrong answer: reveals the word, keeps progress, resets the streak', () => {
            incrementStreak();
            const { target } = mode.challengeData;
            scene.click(wrongCard(mode));
            expect(getStreak()).toBe(0);
            scene.advance(450);
            expect(mode.letterObjects.map(l => l.text.text).join('')).toBe(target.toUpperCase());
            expect(scene.lastAudio()).toBe(`word_audio_${target}`);
            scene.advance(NEXT_QUESTION_MS);
            expect(mode.correctCount).toBe(0);
            expect(calls).toHaveLength(0);
            expect(cards(mode)).toHaveLength(2);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('cleanup during the word reveal leaves nothing behind', () => {
            scene.click(correctCard(mode));
            scene.advance(200);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });

    describe('mixed stage', () => {
        it('alternates rounds through a full game, including after misses, with no missing audio', async () => {
            for (let game = 0; game < 10; game++) {
                const { scene, mode, calls } = await start(STAGE_MIXED);
                const rounds = [];
                for (let i = 0; i < 4; i++) {
                    if (i % 2 === 1) {
                        scene.click(wrongCard(mode));
                        scene.advance(NEXT_QUESTION_MS);
                        expect(mode.roundType).toBe(i % 2);
                    }
                    rounds.push(mode.roundType);
                    scene.click(correctCard(mode));
                    scene.advance(NEXT_QUESTION_MS);
                }
                expect(rounds).toEqual([0, 1, 0, 1]);
                expect(calls).toHaveLength(1);
                expect(scene._missingAudio).toEqual([]);
                expect(scene._useAfterDestroy).toEqual([]);
                mode.cleanup(scene);
                expect(scene.liveObjects()).toEqual([]);
                expect(scene.clock.pendingTimers()).toEqual([]);
            }
        });

        it('reward is sent once even if the last card is tapped again', async () => {
            const { scene, mode, calls } = await start(STAGE_MIXED);
            for (let i = 0; i < 3; i++) {
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
});
