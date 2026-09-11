import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getSpellingWords } from '../spellingWords.js';
import { playWordAudio, getWordAudioKey } from '../wordAudioData.js';
import { createLetterKeyboard, updateLetterKeyboard, destroyLetterKeyboard } from '../components/LetterKeyboard.js';
import { createLetterSlots, showSlotParticleEffect, showSlotErrorEffect, destroyLetterSlots } from '../components/LetterSlots.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';

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

/**
 * Word Spelling game mode
 * Player hears a Swedish word and must spell it using the keyboard
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
        this.isRevealing = false;
        this.livesRemaining = MAX_LIVES;
        this.heartsDisplay = null;

        // Multi-word progress tracking
        this.wordsCompleted = 0;
        this.requiredWords = 3; // Default, will be loaded from config
        this.wordCount = 0;     // 0 = the whole pool; narrowed from config
        this.usedWords = [];    // No repeats within one session
        this.wordBallIndicators = [];
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                if (serverConfig.wordSpelling) {
                    this.requiredWords = serverConfig.wordSpelling.requiredWords || this.requiredWords;
                    this.wordCount = serverConfig.wordSpelling.wordCount || this.wordCount;
                    console.log('WordSpellingMode loaded config:', {
                        requiredWords: this.requiredWords,
                        wordCount: getSpellingWords(this.wordCount).length
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load WordSpelling config, using defaults:', error);
        }
        this.configLoaded = true;
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
        this.currentWord = this.pickWord();
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

    heartsText() {
        return '❤️'.repeat(this.livesRemaining) + '🖤'.repeat(MAX_LIVES - this.livesRemaining);
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh word always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // Show hearts at the top
        this.heartsDisplay = scene.add.text(width / 2, 70, this.heartsText(), {
            font: '36px Arial'
        }).setOrigin(0.5);
        this.uiElements.push(this.heartsDisplay);

        // Speaker button to replay audio (centered at top)
        const speakerBtn = scene.add.text(width / 2, 180, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            playWordAudio(scene, this.challengeData.word);
        });
        this.uiElements.push(speakerBtn);

        // Create letter slots (empty - don't show word)
        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: 350,
            showWord: false, // Don't show the word!
            highlightIndex: this.validIndices[this.currentLetterIndex],
            collectedIndices: this.collectedIndices,
            nameCase: 'lowercase'
        });
        this.uiElements.push(...this.slotsData.elements);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Create letter keyboard
        this.createKeyboard(scene, this.usedLetters);

        // Play word audio automatically when challenge loads
        playWordAudio(scene, this.challengeData.word);
    }

    createKeyboard(scene, usedLetters) {
        this.keyboardData = createLetterKeyboard(scene, {
            startY: 550,
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
        }
        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: 350,
            nameCase: 'lowercase',
            ...config
        });
        this.uiElements.push(...this.slotsData.elements);
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const y = 480;
        const spacing = 60;

        // Show word-based progress (not letter-based)
        const totalWidth = this.requiredWords * spacing;
        const startX = width / 2 - totalWidth / 2 + spacing / 2;

        this.wordBallIndicators = [];

        for (let i = 0; i < this.requiredWords; i++) {
            const x = startX + i * spacing;

            const circle = scene.add.circle(x, y, 20,
                i < this.wordsCompleted ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);

            this.wordBallIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Add gift emoji at the end
        const giftX = startX + this.requiredWords * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '48px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        // Update word progress indicators
        for (let i = 0; i < this.wordBallIndicators.length; i++) {
            if (i < this.wordsCompleted) {
                this.wordBallIndicators[i].setFillStyle(0x27AE60); // Green
            } else {
                this.wordBallIndicators[i].setFillStyle(0xffffff); // White
            }
        }
    }

    handleLetterClick(scene, selectedLetter) {
        // Ignore taps during the reveal and while a letter is being resolved
        if (this.isRevealing || this.inputLocked) return;

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
        const audioKey = `letter_audio_${letter.toLowerCase()}`;
        scene.sound.play(audioKey);

        // Show particle effect at slot position
        const slot = this.slotsData.slots.find(s => s.index === currentIndex);
        if (slot) {
            showSlotParticleEffect(scene, slot.x, slot.y);
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

        // Update hearts display
        if (this.heartsDisplay) {
            this.heartsDisplay.setText(this.heartsText());
        }

        // Play correct letter audio, then wrong letter audio
        const correctAudioKey = `letter_audio_${correctLetter.toLowerCase()}`;
        scene.sound.play(correctAudioKey);

        this.delayedCall(scene, 600, () => {
            const wrongAudioKey = `letter_audio_${selectedLetter.toLowerCase()}`;
            scene.sound.play(wrongAudioKey);
        });

        // Show error effect on highlighted slot
        const slot = this.slotsData.slots.find(s => s.index === currentIndex);
        if (slot) {
            showSlotErrorEffect(scene, slot);
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

    showCorrectAnswer(scene) {
        this.isRevealing = true;

        // Recreate slots with word shown, all letters gold
        this.replaceSlots(scene, {
            showWord: true, // Now show the word!
            highlightIndex: null,
            collectedIndices: this.validIndices // Show all letters as collected
        });

        // Make all slots gold/pulsing
        this.slotsData.slots.forEach(slot => {
            if (slot.isLetter && slot.bg) {
                slot.bg.setFillStyle(0xFFD700, 0.5);
                slot.bg.setStrokeStyle(6, 0xFFD700);
            }
        });

        // Pulse animation
        const slotElements = this.slotsData.slots.flatMap(s => [s.bg, s.text].filter(e => e));
        this.addTween(scene, {
            targets: slotElements,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 500,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut'
        });

        // After 2 seconds, restart with new word
        this.delayedCall(scene, 2000, () => {
            // Clean up current UI
            this.cleanup(scene);

            // Reset state
            this.hasError = false;
            this.isRevealing = false;
            this.wordsCompleted = 0; // Reset word progress on game over

            // Reset streak since player made an error
            resetStreak();

            // Update booster bar visual immediately
            if (scene.boosterBarElements) {
                updateBoosterBar(scene.boosterBarElements, 0, scene);
            }

            // Generate new challenge
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
    }

    // Play the word and run `next` once it has finished (or after a second if
    // the audio is missing). The wait is a mode-owned timer rather than a
    // listener on the sound, so cleanup() cancels it: nothing runs after the
    // scene has moved on.
    playWordThen(scene, word, next) {
        const audioKey = getWordAudioKey(word);
        let durationMs = 1000;
        if (scene.cache.audio.exists(audioKey)) {
            const sound = scene.sound.add(audioKey);
            sound.once('complete', () => sound.destroy());
            sound.play();
            durationMs = sound.duration * 1000;
        } else {
            console.warn(`Word audio not found: ${word}, key: ${audioKey}`);
        }
        this.delayedCall(scene, durationMs + 100, next);
    }

    handleWordComplete(scene) {
        // All letters collected!
        // Increment word progress
        this.wordsCompleted++;
        this.updateBallIndicators();

        // Update slots to show all letters in green
        this.replaceSlots(scene, {
            showWord: true,
            highlightIndex: null,
            collectedIndices: new Set(this.validIndices)
        });

        // Show final particle effect
        const centerX = scene.cameras.main.width / 2;
        const centerY = 350;
        showSlotParticleEffect(scene, centerX, centerY);

        const allDone = this.wordsCompleted >= this.requiredWords;
        const word = this.challengeData.word;

        // Wait for last letter audio to finish, play the whole word, then
        // either hand out the reward or move on to the next word.
        this.delayedCall(scene, 800, () => {
            this.playWordThen(scene, word, () => {
                if (allDone) {
                    this.finish(true, word, centerX, centerY);
                } else {
                    this.loadNextWord(scene);
                }
            });
        });
    }

    loadNextWord(scene) {
        // Tear down the finished word (hearts, slots, keyboard, indicators)
        // and build the next one from scratch. wordsCompleted survives cleanup,
        // so the progress balls come back filled in.
        this.cleanup(scene);
        this.generateChallenge();
        this.createChallengeUI(scene);
    }

    updateLetterDisplay(scene) {
        // Update hearts display to current state
        if (this.heartsDisplay) {
            this.heartsDisplay.setText(this.heartsText());
        }

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
        this.createKeyboard(scene, []);

        // The next slot is highlighted: accept taps again
        this.inputLocked = false;
    }

    cleanup(scene) {
        super.cleanup(scene);

        // Clean up component data
        this.keyboardData = null;
        this.slotsData = null;
        this.wordBallIndicators = [];
        this.heartsDisplay = null;
    }
}
