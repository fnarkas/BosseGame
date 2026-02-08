import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getRandomWord } from '../speechVocabulary.js';
import { playWordAudio, getWordAudioKey } from '../wordAudioData.js';
import { createLetterKeyboard, updateLetterKeyboard, destroyLetterKeyboard } from '../components/LetterKeyboard.js';
import { createLetterSlots, showSlotParticleEffect, showSlotErrorEffect, destroyLetterSlots } from '../components/LetterSlots.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';

const SWEDISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

/**
 * Word Spelling game mode
 * Player hears a Swedish word and must spell it using the keyboard
 */
export class WordSpellingMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.currentWord = null;
        this.currentLetterIndex = 0;
        this.usedLetters = [];
        this.collectedIndices = new Set();
        this.keyboardData = null;
        this.slotsData = null;
        this.hasError = false;
        this.isRevealing = false;
        this.ballIndicators = [];
        this.livesRemaining = 2; // Start with 2 hearts
        this.heartsDisplay = null;

        // Multi-word progress tracking
        this.wordsCompleted = 0;
        this.requiredWords = 3; // Default, will be loaded from config
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
                    console.log('WordSpellingMode loaded config:', {
                        requiredWords: this.requiredWords
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load WordSpelling config, using defaults:', error);
        }
        this.configLoaded = true;
    }

    generateChallenge() {
        // Get random easy word
        this.currentWord = getRandomWord('easy');

        // Find valid letter indices
        const normalizedWord = this.currentWord.word.toUpperCase();
        this.validIndices = [];
        normalizedWord.split('').forEach((char, index) => {
            if (SWEDISH_ALPHABET.includes(char)) {
                this.validIndices.push(index);
            }
        });

        this.challengeData = {
            word: this.currentWord.word,
            translation: this.currentWord.translation,
            correctLetter: normalizedWord[this.validIndices[0]]
        };

        // Reset state
        this.currentLetterIndex = 0;
        this.usedLetters = [];
        this.collectedIndices = new Set();
        this.hasError = false;
        this.isRevealing = false;
        this.livesRemaining = 2; // Reset lives for new challenge
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Store scene reference
        this.scene = scene;

        // Show hearts at the top
        const heartsText = '❤️'.repeat(this.livesRemaining) + '🖤'.repeat(2 - this.livesRemaining);
        this.heartsDisplay = scene.add.text(width / 2, 70, heartsText, {
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
        this.keyboardData = createLetterKeyboard(scene, {
            startY: 550,
            usedLetters: this.usedLetters,
            onLetterClick: (letter) => this.handleLetterClick(scene, letter),
            alphabetCase: 'uppercase'
        });
        this.uiElements.push(...this.keyboardData.elements);

        // Play word audio automatically when challenge loads
        playWordAudio(scene, this.challengeData.word);
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
        if (this.isRevealing) return;

        const normalizedWord = this.challengeData.word.toUpperCase();
        const currentIndex = this.validIndices[this.currentLetterIndex];
        const correctLetter = normalizedWord[currentIndex];

        if (selectedLetter === correctLetter) {
            // Correct letter!
            this.handleCorrectLetter(scene, selectedLetter, currentIndex);
        } else {
            // Wrong letter!
            this.handleWrongLetter(scene, selectedLetter, correctLetter, currentIndex);
        }
    }

    handleCorrectLetter(scene, selectedLetter, currentIndex) {
        // Add to collected
        this.collectedIndices.add(currentIndex);

        // Play letter audio
        const audioKey = `letter_audio_${selectedLetter.toLowerCase()}`;
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
            scene.time.delayedCall(600, () => {
                this.handleWordComplete(scene);
            });
        } else {
            // Update UI for next letter
            scene.time.delayedCall(600, () => {
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
        const heartsText = '❤️'.repeat(this.livesRemaining) + '🖤'.repeat(2 - this.livesRemaining);
        if (this.heartsDisplay) {
            this.heartsDisplay.setText(heartsText);
        }

        // Play correct letter audio, then wrong letter audio
        const correctAudioKey = `letter_audio_${correctLetter.toLowerCase()}`;
        scene.sound.play(correctAudioKey);

        scene.time.delayedCall(600, () => {
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
            // GAME OVER - show correct answer after shake
            scene.time.delayedCall(400, () => {
                this.hasError = true;
                this.showCorrectAnswer(scene);
            });
        }
        // Otherwise, player can continue trying with remaining lives
    }

    showCorrectAnswer(scene) {
        this.isRevealing = true;

        // Recreate slots with word shown
        destroyLetterSlots(this.slotsData.elements);

        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: 350,
            showWord: true, // Now show the word!
            highlightIndex: null,
            collectedIndices: this.validIndices, // Show all letters as collected (gold)
            nameCase: 'lowercase'
        });
        this.uiElements.push(...this.slotsData.elements);

        // Make all slots gold/pulsing
        this.slotsData.slots.forEach(slot => {
            if (slot.isLetter && slot.bg) {
                slot.bg.setFillStyle(0xFFD700, 0.5);
                slot.bg.setStrokeStyle(6, 0xFFD700);
            }
        });

        // Pulse animation
        const slotElements = this.slotsData.slots.flatMap(s => [s.bg, s.text].filter(e => e));
        scene.tweens.add({
            targets: slotElements,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 500,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut'
        });

        // After 2 seconds, restart with new word
        scene.time.delayedCall(2000, () => {
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

    handleWordComplete(scene) {
        // All letters collected!
        // Increment word progress
        this.wordsCompleted++;
        this.updateBallIndicators();

        // Wait for last letter audio to finish before playing word audio
        scene.time.delayedCall(800, () => {
            playWordAudio(scene, this.challengeData.word);
        });

        // Update slots to show all letters in green
        destroyLetterSlots(this.slotsData.elements);

        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: 350,
            showWord: true,
            highlightIndex: null,
            collectedIndices: new Set(this.validIndices),
            nameCase: 'lowercase'
        });
        this.uiElements.push(...this.slotsData.elements);

        // Show final particle effect
        const centerX = scene.cameras.main.width / 2;
        const centerY = 350;
        showSlotParticleEffect(scene, centerX, centerY);

        // Check if we've completed all required words
        if (this.wordsCompleted >= this.requiredWords) {
            // All words complete! Trigger reward
            scene.time.delayedCall(900, () => {
                const audioKey = getWordAudioKey(this.challengeData.word);
                const wordAudio = scene.sound.get(audioKey);

                if (wordAudio && wordAudio.isPlaying) {
                    wordAudio.once('complete', () => {
                        this.answerCallback(true, this.challengeData.word, centerX, centerY);
                    });
                } else {
                    // Fallback: wait 1 second
                    scene.time.delayedCall(1000, () => {
                        this.answerCallback(true, this.challengeData.word, centerX, centerY);
                    });
                }
            });
        } else {
            // More words needed - load next word after audio completes
            scene.time.delayedCall(900, () => {
                const audioKey = getWordAudioKey(this.challengeData.word);
                const wordAudio = scene.sound.get(audioKey);

                if (wordAudio && wordAudio.isPlaying) {
                    wordAudio.once('complete', () => {
                        this.loadNextWord(scene);
                    });
                } else {
                    // Fallback: wait 1 second
                    scene.time.delayedCall(1000, () => {
                        this.loadNextWord(scene);
                    });
                }
            });
        }
    }

    loadNextWord(scene) {
        // Clean up current word UI
        destroyLetterKeyboard(this.keyboardData.elements);
        destroyLetterSlots(this.slotsData.elements);

        // Reset letter tracking for new word
        this.currentLetterIndex = 0;
        this.collectedIndices = new Set();
        this.usedLetters = [];
        this.livesRemaining = 2; // Reset hearts for new word

        // Generate new challenge
        this.generateChallenge();

        // Recreate UI with new word
        // Hearts display
        const heartsText = '❤️❤️';
        this.heartsDisplay = scene.add.text(scene.cameras.main.width / 2, 50, heartsText, {
            fontSize: '48px',
            align: 'center'
        }).setOrigin(0.5);
        this.uiElements.push(this.heartsDisplay);

        // Letter slots
        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: 350,
            showWord: false,
            highlightIndex: this.validIndices[this.currentLetterIndex],
            collectedIndices: this.collectedIndices,
            nameCase: 'lowercase'
        });
        this.uiElements.push(...this.slotsData.elements);

        // Letter keyboard
        this.keyboardData = createLetterKeyboard(scene, {
            startY: 550,
            usedLetters: this.usedLetters,
            onLetterClick: (letter) => this.handleLetterClick(scene, letter),
            alphabetCase: 'uppercase'
        });
        this.uiElements.push(...this.keyboardData.elements);

        // Play word audio for new word
        playWordAudio(scene, this.challengeData.word);
    }

    updateLetterDisplay(scene) {
        // Update hearts display to current state
        if (this.heartsDisplay) {
            const heartsText = '❤️'.repeat(this.livesRemaining) + '🖤'.repeat(2 - this.livesRemaining);
            this.heartsDisplay.setText(heartsText);
        }

        // Destroy old slots
        destroyLetterSlots(this.slotsData.elements);

        // Update challenge data
        const normalizedWord = this.challengeData.word.toUpperCase();
        const currentIndex = this.validIndices[this.currentLetterIndex];
        this.challengeData.correctLetter = normalizedWord[currentIndex];

        // Recreate slots with new highlight
        this.slotsData = createLetterSlots(scene, this.challengeData.word, {
            y: 350,
            showWord: false,
            highlightIndex: currentIndex,
            collectedIndices: this.collectedIndices,
            nameCase: 'lowercase'
        });
        this.uiElements.push(...this.slotsData.elements);

        // Destroy old keyboard
        destroyLetterKeyboard(this.keyboardData.elements);

        // Recreate keyboard with cleared used letters
        this.keyboardData = createLetterKeyboard(scene, {
            startY: 550,
            usedLetters: [], // Clear used letters
            onLetterClick: (letter) => this.handleLetterClick(scene, letter),
            alphabetCase: 'uppercase'
        });
        this.uiElements.push(...this.keyboardData.elements);
    }

    cleanup(scene) {
        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];

        // Clean up component data
        this.keyboardData = null;
        this.slotsData = null;
        this.wordBallIndicators = [];
        this.heartsDisplay = null;
    }
}
