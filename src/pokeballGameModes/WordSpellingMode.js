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
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Store scene reference
        this.scene = scene;

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
        const spacing = 50;

        const numLetters = this.validIndices.length;
        const totalWidth = numLetters * spacing;
        const startX = width / 2 - totalWidth / 2 + spacing / 2;

        this.ballIndicators = [];

        for (let i = 0; i < numLetters; i++) {
            const x = startX + i * spacing;

            const circle = scene.add.circle(x, y, 15,
                i < this.collectedIndices.size ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(2, 0x000000);

            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Add gift emoji at the end
        const giftX = startX + numLetters * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '40px',
            padding: { y: 8 }
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        for (let i = 0; i < this.ballIndicators.length; i++) {
            if (i < this.collectedIndices.size) {
                this.ballIndicators[i].setFillStyle(0x27AE60); // Green
            } else {
                this.ballIndicators[i].setFillStyle(0xffffff); // White
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
        this.updateBallIndicators();

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

        // ONE ERROR = GAME OVER - show correct answer after shake
        scene.time.delayedCall(400, () => {
            this.hasError = true;
            this.showCorrectAnswer(scene);
        });
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
        // All letters collected! Play full word audio
        playWordAudio(scene, this.challengeData.word);

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

        // Wait for word audio to complete, then trigger reward
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
    }

    updateLetterDisplay(scene) {
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
        this.ballIndicators = [];
    }
}
