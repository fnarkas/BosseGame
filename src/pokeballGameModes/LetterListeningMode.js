import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { SWEDISH_LETTERS } from '../letterData.js';

/**
 * Letter Listening game mode
 * Player hears a Swedish letter and must select the correct letter from choices
 */
export class LetterListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedLetters = new Set();
        this.currentAudio = null;
    }

    generateChallenge() {
        // Get unused letters
        const availableLetters = SWEDISH_LETTERS.filter(
            letter => !this.usedLetters.has(letter)
        );

        // If all letters used, reset
        if (availableLetters.length === 0) {
            this.usedLetters.clear();
            return this.generateChallenge();
        }

        // Pick random letter
        const correctLetter = Phaser.Utils.Array.GetRandom(availableLetters);
        this.usedLetters.add(correctLetter);

        // Generate 5 distractors (letters that are not the correct one)
        const otherLetters = SWEDISH_LETTERS.filter(l => l !== correctLetter);
        const distractors = Phaser.Utils.Array.Shuffle(otherLetters).slice(0, 5);

        // Shuffle all choices (correct + distractors)
        const allChoices = [correctLetter, ...distractors];
        const shuffledChoices = Phaser.Utils.Array.Shuffle([...allChoices]);

        this.challengeData = {
            correctLetter: correctLetter,
            letters: shuffledChoices
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Play the letter audio automatically
        this.playLetterAudio(scene, this.challengeData.correctLetter);

        // Instructions
        const instructionText = scene.add.text(width / 2, 180, 'Vilken bokstav hörde du?', {
            font: 'bold 36px Arial',
            fill: '#2C3E50',
            align: 'center'
        }).setOrigin(0.5);
        instructionText.setData('clearOnNewChallenge', true);
        this.uiElements.push(instructionText);

        // Speaker button to replay audio (larger, centered)
        const speakerBtn = scene.add.text(width / 2, 270, '🔊', {
            font: '80px Arial'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        speakerBtn.setData('clearOnNewChallenge', true);
        this.uiElements.push(speakerBtn);

        // Hover effects for speaker
        speakerBtn.on('pointerover', () => {
            speakerBtn.setScale(1.1);
        });

        speakerBtn.on('pointerout', () => {
            speakerBtn.setScale(1.0);
        });

        // Replay audio on click
        speakerBtn.on('pointerdown', () => {
            speakerBtn.setScale(0.9);
            scene.time.delayedCall(100, () => {
                speakerBtn.setScale(1.0);
            });
            this.playLetterAudio(scene, this.challengeData.correctLetter);
        });

        // Create letter buttons in a grid (2 rows of 3)
        const letterButtonSize = 100;
        const letterSpacing = 30;
        const cols = 3;
        const rows = Math.ceil(this.challengeData.letters.length / cols);

        const gridWidth = cols * (letterButtonSize + letterSpacing) - letterSpacing;
        const gridHeight = rows * (letterButtonSize + letterSpacing) - letterSpacing;
        const startX = (width - gridWidth) / 2 + letterButtonSize / 2;
        const startY = 400;

        this.challengeData.letters.forEach((letter, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = startX + col * (letterButtonSize + letterSpacing);
            const y = startY + row * (letterButtonSize + letterSpacing);

            // Background button
            const button = scene.add.rectangle(x, y, letterButtonSize, letterButtonSize, 0xFFFFFF);
            button.setStrokeStyle(4, 0x3498DB);
            button.setInteractive({ useHandCursor: true });
            button.setData('clearOnNewChallenge', true);
            button.setData('letter', letter);
            this.uiElements.push(button);

            // Letter text
            const letterText = scene.add.text(x, y, letter, {
                font: 'bold 56px Arial',
                fill: '#2C3E50'
            }).setOrigin(0.5);
            letterText.setData('clearOnNewChallenge', true);
            this.uiElements.push(letterText);

            // Hover effects
            button.on('pointerover', () => {
                button.setFillStyle(0xECF0F1);
                button.setStrokeStyle(6, 0x2980B9);
            });

            button.on('pointerout', () => {
                button.setFillStyle(0xFFFFFF);
                button.setStrokeStyle(4, 0x3498DB);
            });

            // Click handler
            button.on('pointerdown', () => {
                const isCorrect = this.checkAnswer(letter);
                if (this.answerCallback) {
                    this.answerCallback(isCorrect, letter, x, y);
                }
            });
        });
    }

    playLetterAudio(scene, letter) {
        const audioKey = `letter_audio_${letter.toLowerCase()}`;
        scene.sound.play(audioKey);
    }

    checkAnswer(selectedLetter) {
        return selectedLetter === this.challengeData.correctLetter;
    }

    cleanup(scene) {
        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
