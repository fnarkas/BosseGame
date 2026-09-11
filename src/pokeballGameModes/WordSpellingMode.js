import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getSpellingWords } from '../spellingWords.js';
import { getWordAudioKey } from '../wordAudioData.js';
import { loadModeConfig } from '../minigameConfig.js';
import { createLetterKeyboard, updateLetterKeyboard, destroyLetterKeyboard } from '../components/LetterKeyboard.js';
import { createLetterSlots, showSlotParticleEffect, showSlotErrorEffect, destroyLetterSlots } from '../components/LetterSlots.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

const SWEDISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

// Swedish words that sound identical, so the child hears the word but cannot
// possibly know which spelling was meant. Any spelling in a group is accepted;
// the slot still reveals the spelling the game asked for, so the correct form is
// what the child sees and hears. Mirrors HOMOPHONE_GROUPS in SpeedReadingMode.js,
// which solves the same problem for speech recognition.
// Groups must hold words of equal length — the letter slots come from the target.
const HOMOPHONE_GROUPS = [
    ['sätt', 'sett'],   // both [sɛt:] — short e and ä are the same sound
    ['men', 'män'],     // both [mɛn:]
    ['en', 'än'],       // both [ɛn]
    ['gott', 'gått']    // both [gɔt:] — short o and å are the same sound
];

// Every spelling that sounds like this word, uppercased. The word itself first.
function acceptedSpellingsFor(word) {
    const group = HOMOPHONE_GROUPS.find(g => g.includes(word)) || [];
    return [word, ...group.filter(candidate => candidate !== word)]
        .filter(candidate => candidate.length === word.length)
        .map(candidate => candidate.toUpperCase());
}

const MAX_LIVES = 2;
const HEARTS_Y = 70;
const SPEAKER_Y = 180;
const SLOTS_Y = 350;
const BALLS_Y = 480;
const KEYBOARD_Y = 550;

/**
 * Word Spelling game mode
 * Player hears a Swedish word and must spell it using the keyboard. A word
 * that beats the child (two wrong letters) is shown, read aloud, and comes
 * back straight away and once more a little later.
 */
export class WordSpellingMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.currentWord = null;
        this.acceptedSpellings = [];
        this.currentLetterIndex = 0;
        this.usedLetters = [];
        this.collectedIndices = new Set();
        this.keyboardData = null;
        this.slotsData = null;
        this.hasError = false;
        this.livesRemaining = MAX_LIVES;

        // Multi-word progress tracking
        this.wordsCompleted = 0;
        this.requiredWords = 3; // Default, will be loaded from config
        this.wordCount = 0;     // 0 = the whole pool; narrowed from config
        this.usedWords = [];    // No repeats within one session
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('wordSpelling', { requiredWords: 3, wordCount: 0 });
        this.requiredWords = config.requiredWords || this.requiredWords;
        this.wordCount = config.wordCount || this.wordCount;
        this.configLoaded = true;
        console.log('WordSpellingMode loaded config:', {
            requiredWords: this.requiredWords,
            wordCount: getSpellingWords(this.wordCount).length
        });
    }

    // A word from the pool, avoiding the ones already spelled this session.
    pickWord() {
        const pool = getSpellingWords(this.wordCount);
        const unused = pool.filter(word => !this.usedWords.includes(word));
        const candidates = unused.length > 0 ? unused : pool;
        const word = candidates[Math.floor(Math.random() * candidates.length)];
        this.usedWords.push(word);
        return word;
    }

    generateChallenge() {
        // A missed word comes back regardless of the no-repeat rule.
        this.currentWord = this.takeRetry() ?? this.pickWord();
        this.acceptedSpellings = acceptedSpellingsFor(this.currentWord);

        // Find valid letter indices
        const normalizedWord = this.currentWord.toUpperCase();
        this.validIndices = [];
        normalizedWord.split('').forEach((char, index) => {
            if (SWEDISH_ALPHABET.includes(char)) {
                this.validIndices.push(index);
            }
        });

        this.challengeData = {
            word: this.currentWord,
            correctLetter: normalizedWord[this.validIndices[0]]
        };

        // Reset state
        this.currentLetterIndex = 0;
        this.usedLetters = [];
        this.collectedIndices = new Set();
        this.hasError = false;
        this.isRevealing = false;
        this.livesRemaining = MAX_LIVES;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh word always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        this.createHearts(scene, { max: MAX_LIVES, remaining: this.livesRemaining, y: HEARTS_Y });

        // Speaker button to replay the word (centered at top)
        this.createSpeakerButton(scene, width / 2, SPEAKER_Y, () => this.playWord(scene), { fontSize: '80px' });

        // Create letter slots (empty - don't show word)
        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: SLOTS_Y,
            showWord: false, // Don't show the word!
            highlightIndex: this.validIndices[this.currentLetterIndex],
            collectedIndices: this.collectedIndices,
            nameCase: 'lowercase'
        });
        this.uiElements.push(...this.slotsData.elements);

        // Word-based progress (not letter-based)
        this.createProgressBalls(scene, { total: this.requiredWords, completed: this.wordsCompleted, y: BALLS_Y });

        this.createKeyboard(scene, this.usedLetters);

        // Play word audio automatically when challenge loads
        this.playWord(scene);
    }

    playWord(scene) {
        return this.playAudio(scene, getWordAudioKey(this.challengeData.word));
    }

    createKeyboard(scene, usedLetters) {
        this.keyboardData = createLetterKeyboard(scene, {
            startY: KEYBOARD_Y,
            usedLetters,
            onLetterClick: (letter) => this.handleLetterClick(scene, letter),
            alphabetCase: 'uppercase'
        });
        this.uiElements.push(...this.keyboardData.elements);
    }

    // Swap the letter slots for a fresh set. The old slots may still be mid
    // shake (showSlotErrorEffect), so their tweens are killed first: a tween
    // that completes on a destroyed slot would try to recolour it.
    replaceSlots(scene, config) {
        if (this.slotsData) {
            scene.tweens.killTweensOf(this.slotsData.elements);
            destroyLetterSlots(this.slotsData.elements);
            this.slotsData.elements.forEach(element => {
                const i = this.uiElements.indexOf(element);
                if (i >= 0) this.uiElements.splice(i, 1);
            });
        }
        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: SLOTS_Y,
            nameCase: 'lowercase',
            ...config
        });
        this.uiElements.push(...this.slotsData.elements);
    }

    handleLetterClick(scene, selectedLetter) {
        // Ignore taps during the reveal and while a letter is being resolved
        if (this.isInputBlocked()) return;

        const normalizedWord = this.challengeData.word.toUpperCase();
        const currentIndex = this.validIndices[this.currentLetterIndex];
        const correctLetter = normalizedWord[currentIndex];

        // A letter counts as right if it fits any spelling that sounds the same
        // and still matches everything typed so far — "sätt" and "sett" are one
        // word to the ear. The slot reveals the asked-for spelling either way.
        const stillMatching = this.acceptedSpellings.filter(
            spelling => spelling[currentIndex] === selectedLetter
        );

        if (stillMatching.length > 0) {
            this.acceptedSpellings = stillMatching;
            this.handleCorrectLetter(scene, correctLetter, currentIndex);
        } else {
            // Wrong letter!
            this.handleWrongLetter(scene, selectedLetter, correctLetter, currentIndex);
        }
    }

    // `letter` is the letter of the asked-for spelling, which is not always the
    // key the child pressed — see the homophone handling in handleLetterClick.
    handleCorrectLetter(scene, letter, currentIndex) {
        // No more taps until the next slot is highlighted (or the word is done)
        this.inputLocked = true;

        // Add to collected
        this.collectedIndices.add(currentIndex);

        // Play letter audio
        this.playAudio(scene, `letter_audio_${letter.toLowerCase()}`);

        // Show particle effect at slot position
        const slot = this.slotsData.slots.find(s => s.index === currentIndex);
        if (slot) {
            showSlotParticleEffect(scene, slot.x, slot.y, this);
        }

        // Move to next letter
        this.currentLetterIndex++;

        // Clear used letters for next challenge
        this.usedLetters = [];

        // Check if word is complete
        if (this.currentLetterIndex >= this.validIndices.length) {
            // Word complete!
            this.delayedCall(scene, 600, () => {
                this.handleWordComplete(scene);
            });
        } else {
            // Update UI for next letter
            this.delayedCall(scene, 600, () => {
                this.updateLetterDisplay(scene);
            });
        }
    }

    handleWrongLetter(scene, selectedLetter, correctLetter, currentIndex) {
        // Track wrong answer
        trackWrongAnswer(
            'WordSpellingMode',
            correctLetter,
            selectedLetter
        );

        // Add to used letters
        this.usedLetters.push(selectedLetter);

        // Lose a life
        this.livesRemaining--;
        this.updateHearts(this.livesRemaining);

        // Play correct letter audio, then wrong letter audio
        this.playAudio(scene, `letter_audio_${correctLetter.toLowerCase()}`);
        this.delayedCall(scene, 600, () => {
            this.playAudio(scene, `letter_audio_${selectedLetter.toLowerCase()}`);
        });

        // Show error effect on highlighted slot
        const slot = this.slotsData.slots.find(s => s.index === currentIndex);
        if (slot) {
            showSlotErrorEffect(scene, slot, this);
        }

        // Update keyboard to gray out wrong letter
        updateLetterKeyboard(this.keyboardData.letterButtons, this.usedLetters);

        // Check if out of lives
        if (this.livesRemaining <= 0) {
            // GAME OVER - no more taps; show correct answer after shake
            this.inputLocked = true;
            this.hasError = true;
            this.delayedCall(scene, 400, () => {
                this.showCorrectAnswer(scene);
            });
        }
        // Otherwise, player can continue trying with remaining lives
    }

    // The word beat the child: spell it out in gold, read it aloud, and ask
    // for it again - straight away, and once more a couple of words later.
    showCorrectAnswer(scene) {
        const word = this.challengeData.word;
        this.queueRetry(word);
        this.queueRetry(word, 2);

        // Recreate slots with word shown, all letters gold
        this.replaceSlots(scene, {
            showWord: true, // Now show the word!
            highlightIndex: null,
            collectedIndices: this.validIndices // Show all letters as collected
        });

        const targets = this.slotsData.slots
            .filter(slot => slot.isLetter)
            .flatMap(slot => [slot.bg, slot.text].filter(e => e));
        this.revealAnswer(scene, {
            targets,
            audioKey: getWordAudioKey(word),
            delay: 2000,
            onDone: () => {
                // Word progress starts over after a game over
                this.wordsCompleted = 0;
                this.restartChallenge(scene);
            }
        });
    }

    // Play the word and run `next` once it has finished (or after a second if
    // the audio is missing). The wait is a mode-owned timer rather than a
    // listener on the sound, so cleanup() cancels it: nothing runs after the
    // scene has moved on.
    playWordThen(scene, next) {
        const sound = this.playWord(scene);
        const durationMs = sound && Number.isFinite(sound.duration) ? sound.duration * 1000 : 1000;
        this.delayedCall(scene, durationMs + 100, next);
    }

    handleWordComplete(scene) {
        // All letters collected!
        // Increment word progress
        this.wordsCompleted++;
        this.updateProgressBalls(this.wordsCompleted);

        // Update slots to show all letters in green
        this.replaceSlots(scene, {
            showWord: true,
            highlightIndex: null,
            collectedIndices: new Set(this.validIndices)
        });

        // Show final particle effect
        const centerX = scene.cameras.main.width / 2;
        const centerY = SLOTS_Y;
        showSlotParticleEffect(scene, centerX, centerY, this);

        const allDone = this.wordsCompleted >= this.requiredWords;
        const word = this.challengeData.word;

        // Wait for last letter audio to finish, play the whole word, then
        // either hand out the reward or move on to the next word.
        this.delayedCall(scene, 800, () => {
            this.playWordThen(scene, () => {
                if (allDone) {
                    this.finish(true, word, centerX, centerY);
                } else {
                    // wordsCompleted survives the restart, so the progress
                    // balls come back filled in. The streak is kept.
                    this.restartChallenge(scene, { resetStreak: false });
                }
            });
        });
    }

    updateLetterDisplay(scene) {
        this.updateHearts(this.livesRemaining);

        // Update challenge data
        const normalizedWord = this.challengeData.word.toUpperCase();
        const currentIndex = this.validIndices[this.currentLetterIndex];
        this.challengeData.correctLetter = normalizedWord[currentIndex];

        // Recreate slots with new highlight
        this.replaceSlots(scene, {
            showWord: false,
            highlightIndex: currentIndex,
            collectedIndices: this.collectedIndices
        });

        // Recreate keyboard with cleared used letters
        destroyLetterKeyboard(this.keyboardData.elements);
        this.keyboardData.elements.forEach(element => {
            const i = this.uiElements.indexOf(element);
            if (i >= 0) this.uiElements.splice(i, 1);
        });
        this.createKeyboard(scene, []);

        // The next slot is highlighted: accept taps again
        this.inputLocked = false;
    }

    cleanup(scene) {
        super.cleanup(scene);

        // Clean up component data
        this.keyboardData = null;
        this.slotsData = null;
    }
}
