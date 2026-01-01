import { BaseAnswerMode } from './BaseAnswerMode.js';

/**
 * Letter matching game mode
 * Player must identify which letter is highlighted in the Pokemon's name
 *
 * @param {Object} config - Configuration options
 * @param {string} config.nameCase - Case for Pokemon name display: 'lowercase' | 'uppercase' (default: 'lowercase')
 * @param {string} config.alphabetCase - Case for alphabet buttons: 'lowercase' | 'uppercase' (default: 'uppercase')
 */
export class LetterMatchMode extends BaseAnswerMode {
    constructor(config = {}) {
        super();
        this.swedishAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');
        this.currentLetter = null;
        this.usedLetters = [];
        this.uiElements = []; // Track UI elements for cleanup

        // Configuration options
        this.config = {
            nameCase: config.nameCase || 'lowercase',      // 'lowercase' | 'uppercase'
            alphabetCase: config.alphabetCase || 'uppercase' // 'lowercase' | 'uppercase'
        };
    }

    generateChallenge(pokemon) {
        // Reset state
        this.usedLetters = [];

        // Extract letters from Pokemon name (uppercase, filter special chars)
        const nameLetters = pokemon.name
            .toUpperCase()
            .split('')
            .filter(char => this.swedishAlphabet.includes(char));

        // Pick a random letter from the Pokemon's name
        this.currentLetter = Phaser.Utils.Array.GetRandom(nameLetters);

        // Find the first position of this letter in the name (for highlighting)
        const normalizedName = pokemon.name.toUpperCase();
        const highlightIndex = normalizedName.indexOf(this.currentLetter);

        this.challengeData = {
            correctAnswer: this.currentLetter,
            pokemon: pokemon,
            pokemonName: pokemon.name,
            highlightIndex: highlightIndex
        };

        return this.challengeData;
    }

    createChallengeUI(scene, attemptsLeft) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Show attempts (hearts) - positioned above Pokemon with more margin
        const heartsText = '❤️'.repeat(attemptsLeft) + '🖤'.repeat(3 - attemptsLeft);
        this.attemptsDisplay = scene.add.text(width / 2, 70, heartsText, {
            font: '36px Arial'
        }).setOrigin(0.5);
        this.attemptsDisplay.setData('clearOnNewEncounter', true);
        this.uiElements.push(this.attemptsDisplay);

        // Display Pokemon name with highlighted letter
        this.displayPokemonName(scene);

        // Create letter buttons
        this.createLetterButtons(scene);
    }

    displayPokemonName(scene) {
        const width = scene.cameras.main.width;

        // Apply case transformation based on config
        const displayName = this.config.nameCase === 'uppercase'
            ? this.challengeData.pokemonName.toUpperCase()
            : this.challengeData.pokemonName.toLowerCase();
        const nameLetters = displayName.split('');

        const letterWidth = 60;
        const letterHeight = 80;
        const spacing = 10;
        const totalWidth = nameLetters.length * (letterWidth + spacing) - spacing;
        const startX = (width - totalWidth) / 2 + letterWidth / 2;
        const y = 500;

        nameLetters.forEach((letter, index) => {
            const x = startX + index * (letterWidth + spacing);
            const isHighlight = (index === this.challengeData.highlightIndex);

            // Skip special characters (display but don't create interactable boxes)
            // Normalize to uppercase for checking against alphabet
            const isLetter = this.swedishAlphabet.includes(letter.toUpperCase());

            if (isLetter) {
                // Background box
                const bg = scene.add.rectangle(x, y, letterWidth, letterHeight,
                    isHighlight ? 0xFFD700 : 0xE8E8E8);
                bg.setStrokeStyle(isHighlight ? 5 : 2, isHighlight ? 0xFF6B00 : 0xCCCCCC);
                bg.setData('clearOnNewEncounter', true);

                // Make non-highlighted letters more inactive
                if (!isHighlight) {
                    bg.setAlpha(0.4);
                }

                this.uiElements.push(bg);

                // Add glow effect for highlighted letter
                if (isHighlight) {
                    const glow = scene.add.rectangle(x, y, letterWidth + 10, letterHeight + 10, 0xFFD700, 0.3);
                    glow.setData('clearOnNewEncounter', true);
                    this.uiElements.push(glow);
                    bg.setDepth(1);
                }
            }

            // Letter text
            const text = scene.add.text(x, y, letter, {
                font: isHighlight ? 'bold 52px Arial' : 'bold 44px Arial',
                fill: isHighlight ? '#000000' : '#999999'
            }).setOrigin(0.5);
            text.setData('clearOnNewEncounter', true);

            // Make non-highlighted letters more inactive
            if (!isHighlight) {
                text.setAlpha(0.4);
            }

            if (isHighlight) {
                text.setDepth(2);
            }
            this.uiElements.push(text);
        });
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

            // Apply case transformation based on config
            const displayLetter = this.config.alphabetCase === 'uppercase'
                ? letter
                : letter.toLowerCase();

            const text = scene.add.text(x, y, displayLetter, {
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
