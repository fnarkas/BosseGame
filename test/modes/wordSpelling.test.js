import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { assetFileExists } from '../helpers/assets.js';
import { WordSpellingMode } from '../../src/pokeballGameModes/WordSpellingMode.js';
import { SPELLING_WORDS } from '../../src/spellingWords.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

// Timings inside the mode
const LETTER_STEP = 600;      // correct letter -> next slot highlighted / word complete
const WORD_DONE = 800 + 600;  // handleWordComplete -> word audio (0.5s fake) + 100ms -> next

function keyFor(scene, letter) {
    return scene.interactives().find(o => o.type === 'Rectangle' && o.getData('letter') === letter);
}
function expectedLetter(mode) {
    return mode.challengeData.word.toUpperCase()[mode.validIndices[mode.currentLetterIndex]];
}
function wrongLetterFor(mode) {
    const word = mode.challengeData.word.toUpperCase();
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('').find(l => !word.includes(l));
}
// Spell the current word, one correct letter at a time, and wait for the
// completion sequence (word audio, then reward or next word).
function spellCurrentWord(scene, mode) {
    const word = mode.challengeData.word;
    const count = mode.validIndices.length;
    for (let i = 0; i < count; i++) {
        const key = keyFor(scene, expectedLetter(mode));
        expect(key, `key ${expectedLetter(mode)} of ${word}`).toBeTruthy();
        scene.click(key);
        scene.advance(LETTER_STEP);
    }
    scene.advance(WORD_DONE);
    return word;
}
// Make the next generateChallenge() pick exactly this word.
function forceWord(mode, word) {
    mode.usedWords = SPELLING_WORDS.filter(w => w !== word);
}

describe('WordSpellingMode', () => {
    let scene, mode, calls;

    beforeEach(async () => {
        setTestConfig({ wordSpelling: { requiredWords: 2, wordCount: 447 } });
        scene = new FakeScene();
        mode = new WordSpellingMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    describe('challenge generation', () => {
        it('always picks a pool word with slots for every letter and matching accepted spellings', () => {
            const fresh = new WordSpellingMode();
            for (let i = 0; i < 600; i++) {
                fresh.generateChallenge();
                const word = fresh.challengeData.word;
                expect(SPELLING_WORDS).toContain(word);
                expect(fresh.validIndices).toEqual([...word].map((_, idx) => idx));
                expect(fresh.challengeData.correctLetter).toBe(word.toUpperCase()[0]);
                expect(fresh.acceptedSpellings[0]).toBe(word.toUpperCase());
                fresh.acceptedSpellings.forEach(s => expect(s).toHaveLength(word.length));
                expect(fresh.currentLetterIndex).toBe(0);
                expect(fresh.collectedIndices.size).toBe(0);
                expect(fresh.livesRemaining).toBe(2);
            }
        });

        it('never repeats a word until the whole pool has been used', () => {
            const fresh = new WordSpellingMode();
            const seen = new Set();
            for (let i = 0; i < SPELLING_WORDS.length; i++) {
                fresh.generateChallenge();
                expect(seen.has(fresh.challengeData.word)).toBe(false);
                seen.add(fresh.challengeData.word);
            }
            expect(seen.size).toBe(SPELLING_WORDS.length);
            // Pool exhausted: still produces a word
            fresh.generateChallenge();
            expect(SPELLING_WORDS).toContain(fresh.challengeData.word);
        });

        it('has audio loaded by BootScene (and a file on disk) for every word in the pool', () => {
            const missingKeys = SPELLING_WORDS.filter(w => !scene.cache.audio.exists(`word_audio_${w}`));
            expect(missingKeys).toEqual([]);
            const missingFiles = SPELLING_WORDS.filter(w => !assetFileExists(`word_audio/${w}.mp3`));
            expect(missingFiles).toEqual([]);
            const letters = new Set(SPELLING_WORDS.join('').split(''));
            const missingLetters = [...letters].filter(l => !scene.cache.audio.exists(`letter_audio_${l}`));
            expect(missingLetters).toEqual([]);
        });
    });

    describe('config', () => {
        it('reads requiredWords and narrows the pool to the first wordCount words', async () => {
            setTestConfig({ wordSpelling: { requiredWords: 4, wordCount: 5 } });
            const m = new WordSpellingMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredWords).toBe(4);
            const allowed = SPELLING_WORDS.slice(0, 5);
            for (let i = 0; i < 50; i++) {
                m.generateChallenge();
                expect(allowed).toContain(m.challengeData.word);
            }
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ wordSpelling: undefined });
            const m = new WordSpellingMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredWords).toBe(3);
            expect(m.wordCount).toBe(0);
        });

        it('draws the progress balls from requiredWords', () => {
            expect(mode.progressBalls.circles).toHaveLength(2);
            expect(scene.findText('🎁')).toBeTruthy();
        });
    });

    describe('happy path', () => {
        it('plays the word on start and again on the speaker button', () => {
            const key = `word_audio_${mode.challengeData.word}`;
            expect(scene.playedAudio()).toEqual([key]);
            scene.click(scene.findText('🔊'));
            expect(scene.playedAudio()).toEqual([key, key]);
        });

        it('spells requiredWords words, then rewards exactly once', () => {
            const first = spellCurrentWord(scene, mode);
            expect(calls).toHaveLength(0);
            expect(mode.wordsCompleted).toBe(1);
            expect(mode.progressBalls.circles[0].fillColor).toBe(0x27AE60);
            expect(mode.progressBalls.circles[1].fillColor).toBe(0xffffff);
            // A new word with fresh hearts and a single hearts display
            expect(mode.challengeData.word).not.toBe(first);
            expect(mode.livesRemaining).toBe(2);
            expect(scene.findTexts(t => t.text.includes('❤️'))).toHaveLength(1);
            expect(scene.lastAudio()).toBe(`word_audio_${mode.challengeData.word}`);

            const second = spellCurrentWord(scene, mode);
            expect(calls).toEqual([{ ok: true, answer: second, x: 640, y: 350 }]);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._missingAudio).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('plays the letter, moves the highlight and rebuilds the keyboard after a correct letter', () => {
            const letter = expectedLetter(mode);
            scene.click(keyFor(scene, letter));
            expect(scene.lastAudio()).toBe(`letter_audio_${letter.toLowerCase()}`);
            expect(mode.collectedIndices.has(0)).toBe(true);
            scene.advance(LETTER_STEP);
            if (mode.validIndices.length > 1) {
                expect(mode.currentLetterIndex).toBe(1);
                expect(mode.slotsData.highlightedSlot.index).toBe(1);
                expect(mode.challengeData.correctLetter).toBe(expectedLetter(mode));
                expect(mode.inputLocked).toBe(false);
                // All 29 keys are back and enabled
                expect(scene.interactives().filter(o => o.getData('letter'))).toHaveLength(29);
            }
        });

        it('accepts any spelling that sounds the same (homophones) and reveals the asked-for one', async () => {
            mode.cleanup(scene);
            mode.requiredWords = 1;
            forceWord(mode, 'men');
            mode.generateChallenge();
            mode.createChallengeUI(scene);
            expect(mode.challengeData.word).toBe('men');
            expect(mode.acceptedSpellings).toEqual(['MEN', 'MÄN']);

            scene.click(keyFor(scene, 'M'));
            scene.advance(LETTER_STEP);
            scene.click(keyFor(scene, 'Ä'));
            expect(mode.livesRemaining).toBe(2);
            expect(mode.acceptedSpellings).toEqual(['MÄN']);
            // The slot audio/reveal follow the asked-for spelling
            expect(scene.lastAudio()).toBe('letter_audio_e');
            scene.advance(LETTER_STEP);
            scene.click(keyFor(scene, 'N'));
            scene.advance(LETTER_STEP + WORD_DONE);
            expect(calls).toEqual([{ ok: true, answer: 'men', x: 640, y: 350 }]);
            const revealed = scene.findTexts(t => t.getData('letterSlot')).map(t => t.text).join('');
            expect(revealed).toBe('men');
        });
    });

    describe('lockout', () => {
        it('ignores extra taps while a correct letter is being resolved', () => {
            const letter = expectedLetter(mode);
            const key = keyFor(scene, letter);
            scene.click(key);
            scene.click(key);
            scene.click(key);
            expect(mode.currentLetterIndex).toBe(1);
            expect(mode.collectedIndices.size).toBe(1);
            expect(mode.livesRemaining).toBe(2);
            // Nor a wrong one
            scene.click(keyFor(scene, wrongLetterFor(mode)));
            expect(mode.livesRemaining).toBe(2);
            scene.advance(LETTER_STEP);
            // Exactly one keyboard on screen afterwards
            expect(scene.liveObjects().filter(o => o.getData('letter'))).toHaveLength(29);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('ignores taps after the last letter of a word', () => {
            mode.cleanup(scene);
            forceWord(mode, 'du');
            mode.generateChallenge();
            mode.createChallengeUI(scene);
            scene.click(keyFor(scene, 'D'));
            scene.advance(LETTER_STEP);
            scene.click(keyFor(scene, 'U'));
            // Word is done; hammering the keyboard must not throw or cost hearts
            for (const l of ['U', 'D', 'X']) scene.click(keyFor(scene, l));
            expect(mode.livesRemaining).toBe(2);
            scene.advance(LETTER_STEP + WORD_DONE);
            expect(mode.wordsCompleted).toBe(1);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });

    describe('wrong answers', () => {
        it('costs a heart, greys out the key and lets the player keep trying', () => {
            const wrong = wrongLetterFor(mode);
            const wrongKey = keyFor(scene, wrong);
            const correct = expectedLetter(mode);
            scene.click(wrongKey);
            expect(mode.livesRemaining).toBe(1);
            expect(mode.hearts.text.text).toBe('❤️🖤');
            expect(wrongKey.input.enabled).toBe(false);
            expect(mode.usedLetters).toEqual([wrong]);
            expect(scene.playedAudio().slice(-1)).toEqual([`letter_audio_${correct.toLowerCase()}`]);
            scene.advance(600);
            expect(scene.lastAudio()).toBe(`letter_audio_${wrong.toLowerCase()}`);
            expect(mode.inputLocked).toBe(false);
            // Still playable
            scene.click(keyFor(scene, correct));
            expect(mode.collectedIndices.has(0)).toBe(true);
            scene.advance(LETTER_STEP);
            expect(mode.usedLetters).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('reveals the word, resets the streak and progress, then restarts after two wrong letters', () => {
            incrementStreak();
            mode.requiredWords = 5; // room for the delayed retry before the reward
            spellCurrentWord(scene, mode);
            expect(mode.wordsCompleted).toBe(1);
            const word = mode.challengeData.word;
            const wrong = wrongLetterFor(mode);
            scene.click(keyFor(scene, wrong));
            const wrong2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('')
                .find(l => l !== wrong && !word.toUpperCase().includes(l));
            scene.click(keyFor(scene, wrong2));
            expect(mode.livesRemaining).toBe(0);
            expect(mode.hearts.text.text).toBe('🖤🖤');
            expect(mode.inputLocked).toBe(true);

            // A correct tap in the window before the reveal must not count
            scene.click(keyFor(scene, expectedLetter(mode)));
            expect(mode.collectedIndices.size).toBe(0);

            scene.advance(400);
            expect(mode.isRevealing).toBe(true);
            const revealed = scene.findTexts(t => t.getData('letterSlot')).map(t => t.text).join('');
            expect(revealed).toBe(word);
            // Taps during the reveal are ignored too
            scene.click(keyFor(scene, expectedLetter(mode)));
            expect(mode.collectedIndices.size).toBe(0);

            // The word is read aloud while it is shown
            expect(scene.lastAudio()).toBe(`word_audio_${word}`);

            scene.advance(2000);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.wordsCompleted).toBe(0);
            expect(mode.livesRemaining).toBe(2);
            expect(mode.progressBalls.circles.every(c => c.fillColor === 0xffffff)).toBe(true);
            expect(getStreak()).toBe(0);
            expect(calls).toHaveLength(0);
            expect(scene.interactives().filter(o => o.getData('letter'))).toHaveLength(29);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);
            // The missed word is asked again straight away ...
            expect(mode.challengeData.word).toBe(word);
            spellCurrentWord(scene, mode);
            expect(mode.challengeData.word).not.toBe(word);
            spellCurrentWord(scene, mode);
            // ... and once more two words later
            expect(mode.challengeData.word).toBe(word);
        });

        it('keeps the streak when moving on to the next word', () => {
            incrementStreak();
            spellCurrentWord(scene, mode);
            expect(mode.wordsCompleted).toBe(1);
            expect(getStreak()).toBe(1);
        });

        it('shows only learning content: no status or instruction text', () => {
            const check = () => scene.liveTexts().forEach(t => {
                expect(/[a-zåäö]{3,} [a-zåäö]/i.test(t.text), t.text).toBe(false);
                expect(t.text.length <= 1 || ['🔊', '🎁'].includes(t.text) || t.text.includes('❤️') || t.text.includes('🖤'), t.text).toBe(true);
            });
            check();
            const wrongs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('').filter(l => !mode.challengeData.word.toUpperCase().includes(l));
            scene.click(keyFor(scene, wrongs[0]));
            scene.click(keyFor(scene, wrongs[1]));
            scene.advance(500);
            check();
        });
    });

    describe('cleanup', () => {
        it('leaves nothing behind when cleaned up mid-letter', () => {
            scene.click(keyFor(scene, expectedLetter(mode)));
            scene.advance(100);
            expect(scene.liveObjectsOfType('ParticleEmitter')).toHaveLength(1);
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(scene.clock.pendingTimers()).toEqual([]);
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('leaves nothing behind when cleaned up during a game-over reveal', () => {
            const word = mode.challengeData.word.toUpperCase();
            const wrongs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('').filter(l => !word.includes(l));
            scene.click(keyFor(scene, wrongs[0]));
            scene.advance(100); // slot mid-shake
            scene.click(keyFor(scene, wrongs[1]));
            scene.advance(500); // revealing
            mode.cleanup(scene);
            expect(scene.clock.pendingTweens()).toEqual([]);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('never delivers the reward after cleanup', () => {
            spellCurrentWord(scene, mode);
            const count = mode.validIndices.length;
            for (let i = 0; i < count; i++) {
                scene.click(keyFor(scene, expectedLetter(mode)));
                scene.advance(LETTER_STEP);
            }
            scene.advance(900); // word audio playing, reward pending
            mode.cleanup(scene);
            scene.advance(10000);
            expect(calls).toHaveLength(0);
            expect(scene.liveObjects()).toEqual([]);
        });
    });
});
