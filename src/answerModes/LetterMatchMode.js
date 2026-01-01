import { BaseAnswerMode } from './BaseAnswerMode.js';

/**
 * Letter matching game mode
 * Player must identify which letter the Pokemon's name starts with
 */
export class LetterMatchMode extends BaseAnswerMode {
    constructor() {
        super();
        this.swedishAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');
        this.currentLetter = null;
        this.usedLetters = [];
        this.uiElements = []; // Track UI elements for cleanup
    }

    generateChallenge(pokemon) {
        // Reset state
        this.usedLetters = [];

        // Pick a random letter
        this.currentLetter = Phaser.Utils.Array.GetRandom(this.swedishAlphabet);

        this.challengeData = {
            correctAnswer: this.currentLetter,
            pokemon: pokemon
        };

        return this.challengeData;
    }

    createChallengeUI(scene, attemptsLeft) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Show attempts (hearts)
        const heartsText = '❤️'.repeat(attemptsLeft) + '🖤'.repeat(3 - attemptsLeft);
        this.attemptsDisplay = scene.add.text(width / 2, 380, heartsText, {
            font: '36px Arial'
        }).setOrigin(0.5);
        this.attemptsDisplay.setData('clearOnNewEncounter', true);
        this.uiElements.push(this.attemptsDisplay);

        // Show lowercase letter challenge
        const letterDisplay = scene.add.text(width / 2, 500, this.currentLetter.toLowerCase(), {
            font: 'bold 72px Arial',
            fill: '#FFD700',
            stroke: '#000000',
            strokeThickness: 6,
            backgroundColor: '#ffffff',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5);
        letterDisplay.setData('clearOnNewEncounter', true);
        this.uiElements.push(letterDisplay);

        // Create letter buttons
        this.createLetterButtons(scene);
    }

    createLetterButtons(scene) {
        const width = scene.cameras.main.width;
        const startY = 600;
        const buttonWidth = 50;
        const buttonHeight = 50;
        const spacing = 10;
        const lettersPerRow = 10;

        this.swedishAlphabet.forEach((letter, index) => {
            const row = Math.floor(index / lettersPerRow);
            const col = index % lettersPerRow;

            const x = width / 2 - (lettersPerRow * (buttonWidth + spacing)) / 2 + col * (buttonWidth + spacing) + buttonWidth / 2;
            const y = startY + row * (buttonHeight + spacing);

            const isUsed = this.usedLetters.includes(letter);
            const bgColor = isUsed ? 0x666666 : 0x4CAF50;

            const button = scene.add.rectangle(x, y, buttonWidth, buttonHeight, bgColor);
            button.setStrokeStyle(2, 0x000000);
            button.setData('clearOnNewEncounter', true);
            button.setData('letter', letter);
            this.uiElements.push(button);

            const text = scene.add.text(x, y, letter, {
                font: 'bold 24px Arial',
                fill: isUsed ? '#999999' : '#ffffff'
            }).setOrigin(0.5);
            text.setData('clearOnNewEncounter', true);
            this.uiElements.push(text);

            if (!isUsed) {
                button.setInteractive({ useHandCursor: true });

                button.on('pointerover', () => {
                    button.setFillStyle(0x66BB6A);
                });

                button.on('pointerout', () => {
                    button.setFillStyle(0x4CAF50);
                });

                button.on('pointerdown', () => {
                    const isCorrect = this.checkAnswer(letter);
                    if (this.answerCallback) {
                        this.answerCallback(isCorrect);
                    }
                });

                // Store reference for easy update
                button.setData('textObj', text);
            }
        });
    }

    updateUI(scene, attemptsLeft, usedData) {
        // Update hearts display
        const heartsText = '❤️'.repeat(attemptsLeft) + '🖤'.repeat(3 - attemptsLeft);
        this.attemptsDisplay.setText(heartsText);

        // Update used letters
        this.usedLetters = usedData.usedLetters || [];

        // Recreate letter buttons with updated used letters
        const buttonsToRemove = [];
        this.uiElements.forEach(element => {
            if (element.getData && element.getData('letter')) {
                buttonsToRemove.push(element);
                if (element.getData('textObj')) {
                    buttonsToRemove.push(element.getData('textObj'));
                }
            }
        });

        buttonsToRemove.forEach(element => {
            const index = this.uiElements.indexOf(element);
            if (index > -1) {
                this.uiElements.splice(index, 1);
            }
            element.destroy();
        });

        this.createLetterButtons(scene);
    }

    checkAnswer(selectedLetter) {
        if (selectedLetter === this.currentLetter) {
            return true;
        } else {
            // Add to used letters
            this.usedLetters.push(selectedLetter);
            return false;
        }
    }

    cleanup(scene) {
        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.attemptsDisplay = null;
    }

    getUsedData() {
        return {
            usedLetters: this.usedLetters
        };
    }
}
