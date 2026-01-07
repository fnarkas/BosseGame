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

        // Progressive letter collection state
        this.collectedIndices = new Set(); // Indices in name that have been collected
        this.allLetterIndices = []; // All valid letter indices in the Pokemon name
        this.remainingIndices = []; // Indices that still need to be collected
        this.currentLetterPosition = 0; // Track current position in sequential order

        // UI element references for animations
        this.currentHighlightBg = null;
        this.currentHighlightText = null;
        this.currentHighlightGlow = null;

        // Configuration options
        this.config = {
            nameCase: config.nameCase || 'lowercase',      // 'lowercase' | 'uppercase'
            alphabetCase: config.alphabetCase || 'uppercase' // 'lowercase' | 'uppercase'
        };
    }

    generateChallenge(pokemon) {
        // Reset state
        this.usedLetters = [];
        this.collectedIndices = new Set();
        this.allLetterIndices = [];
        this.remainingIndices = [];
        this.currentLetterPosition = 0; // Start from the beginning

        // Find all valid letter indices in the Pokemon name
        const normalizedName = pokemon.name.toUpperCase();
        normalizedName.split('').forEach((char, index) => {
            if (this.swedishAlphabet.includes(char)) {
                this.allLetterIndices.push(index);
                this.remainingIndices.push(index);
            }
        });

        // Pick the FIRST letter in the name (sequential order)
        const firstIndex = this.allLetterIndices[0];
        this.currentLetter = normalizedName[firstIndex];

        this.challengeData = {
            correctAnswer: this.currentLetter,
            pokemon: pokemon,
            pokemonName: pokemon.name,
            highlightIndex: firstIndex
        };

        return this.challengeData;
    }

    createChallengeUI(scene, attemptsLeft) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Store scene reference for later updates
        this.scene = scene;

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
            const isCollected = this.collectedIndices.has(index);

            // Skip special characters (display but don't create interactable boxes)
            // Normalize to uppercase for checking against alphabet
            const isLetter = this.swedishAlphabet.includes(letter.toUpperCase());

            if (isLetter) {
                // Determine visual state
                let bgColor, borderColor, borderWidth, alpha;

                if (isCollected) {
                    // Collected state: solid green/blue
                    bgColor = 0x4CAF50; // Green
                    borderColor = 0x388E3C; // Darker green
                    borderWidth = 3;
                    alpha = 1.0;
                } else if (isHighlight) {
                    // Highlighted state: gold
                    bgColor = 0xFFD700;
                    borderColor = 0xFF6B00;
                    borderWidth = 5;
                    alpha = 1.0;
                } else {
                    // Uncollected state: faded gray
                    bgColor = 0xE8E8E8;
                    borderColor = 0xCCCCCC;
                    borderWidth = 2;
                    alpha = 0.4;
                }

                // Background box
                const bg = scene.add.rectangle(x, y, letterWidth, letterHeight, bgColor);
                bg.setStrokeStyle(borderWidth, borderColor);
                bg.setData('clearOnNewEncounter', true);
                bg.setData('pokemonNameLetter', true); // Mark for selective removal
                bg.setAlpha(alpha);
                this.uiElements.push(bg);

                // Add glow effect for highlighted letter
                if (isHighlight) {
                    const glow = scene.add.rectangle(x, y, letterWidth + 10, letterHeight + 10, 0xFFD700, 0.3);
                    glow.setData('clearOnNewEncounter', true);
                    glow.setData('pokemonNameLetter', true); // Mark for selective removal
                    this.uiElements.push(glow);
                    bg.setDepth(1);

                    // Store reference for animations
                    this.currentHighlightGlow = glow;
                }

                // Store reference to highlighted background for animations
                if (isHighlight) {
                    this.currentHighlightBg = bg;
                    this.currentHighlightX = x;
                    this.currentHighlightY = y;
                }
            }

            // Letter text
            let textColor, fontSize, textAlpha;
            if (isCollected) {
                textColor = '#FFFFFF';
                fontSize = 'bold 52px Arial';
                textAlpha = 1.0;
            } else if (isHighlight) {
                textColor = '#000000';
                fontSize = 'bold 52px Arial';
                textAlpha = 1.0;
            } else {
                textColor = '#999999';
                fontSize = 'bold 44px Arial';
                textAlpha = 0.4;
            }

            const text = scene.add.text(x, y, letter, {
                font: fontSize,
                fill: textColor
            }).setOrigin(0.5);
            text.setData('clearOnNewEncounter', true);
            text.setData('pokemonNameLetter', true); // Mark for selective removal
            text.setAlpha(textAlpha);

            if (isHighlight || isCollected) {
                text.setDepth(2);
            }
            this.uiElements.push(text);

            // Store reference to highlighted text for animations
            if (isHighlight) {
                this.currentHighlightText = text;
            }
        });
    }

    updateLetterDisplay() {
        // Remove all Pokemon name letter elements
        const elementsToRemove = [];
        this.uiElements.forEach(element => {
            if (element.getData && element.getData('pokemonNameLetter')) {
                elementsToRemove.push(element);
            }
        });

        elementsToRemove.forEach(element => {
            const index = this.uiElements.indexOf(element);
            if (index > -1) {
                this.uiElements.splice(index, 1);
            }
            element.destroy();
        });

        // Re-render Pokemon name with updated state
        this.displayPokemonName(this.scene);

        // Also recreate letter buttons to reflect cleared usedLetters
        this.recreateLetterButtons();
    }

    recreateLetterButtons() {
        // Remove all letter button elements
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

        // Recreate buttons with current usedLetters state
        this.createLetterButtons(this.scene);
    }

    showCorrectLetterEffect() {
        if (!this.currentHighlightX || !this.currentHighlightY || !this.scene) {
            return;
        }

        // Use stored center position of the letter
        const x = this.currentHighlightX;
        const y = this.currentHighlightY;

        // Create star-shaped particle texture (bigger)
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(0xFFD700, 1);

        // Draw a larger star (centered in texture)
        const starPoints = 5;
        const outerRadius = 16;  // Increased from 8
        const innerRadius = 8;   // Increased from 4
        const centerOffset = 20; // Center the star in the 40x40 texture
        graphics.beginPath();
        for (let i = 0; i < starPoints * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / starPoints - Math.PI / 2;
            const px = centerOffset + radius * Math.cos(angle);
            const py = centerOffset + radius * Math.sin(angle);
            if (i === 0) {
                graphics.moveTo(px, py);
            } else {
                graphics.lineTo(px, py);
            }
        }
        graphics.closePath();
        graphics.fillPath();

        graphics.generateTexture('correctLetterStar', 40, 40);  // Increased from 20x20
        graphics.destroy();

        // Create particle emitter around the letter with bigger particles
        const particles = this.scene.add.particles(x, y, 'correctLetterStar', {
            speed: { min: 150, max: 250 },  // Increased speed for more impact
            angle: { min: 0, max: 360 },
            scale: { start: 1.5, end: 0 },  // Increased starting scale from 1 to 1.5
            lifespan: 700,  // Slightly longer lifespan
            gravityY: 150,  // Increased gravity
            quantity: 20    // More particles (increased from 15)
        });
        particles.setDepth(50);
        particles.explode();

        // Clean up particles after animation
        this.scene.time.delayedCall(900, () => {
            particles.destroy();
        });
    }

    showIncorrectLetterEffect() {
        if (!this.currentHighlightBg || !this.currentHighlightText || !this.scene) {
            return;
        }

        const originalBgColor = 0xFFD700;
        const originalBorderColor = 0xFF6B00;
        const errorColor = 0xFF0000;

        // Flash red
        this.currentHighlightBg.setFillStyle(errorColor);
        this.currentHighlightBg.setStrokeStyle(5, errorColor);

        // Shake animation
        const originalX = this.currentHighlightBg.x;
        const originalTextX = this.currentHighlightText.x;
        const glowOriginalX = this.currentHighlightGlow ? this.currentHighlightGlow.x : null;

        this.scene.tweens.add({
            targets: [this.currentHighlightBg, this.currentHighlightText, this.currentHighlightGlow].filter(t => t !== null),
            x: originalX - 5,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                // Return to original position
                this.currentHighlightBg.x = originalX;
                this.currentHighlightText.x = originalTextX;
                if (this.currentHighlightGlow) {
                    this.currentHighlightGlow.x = glowOriginalX;
                }

                // Return to original color
                this.currentHighlightBg.setFillStyle(originalBgColor);
                this.currentHighlightBg.setStrokeStyle(5, originalBorderColor);
            }
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
                    const result = this.checkAnswer(letter);

                    // Only call callback if result is not null
                    // null = correct but more letters remain (handled internally)
                    // true = all letters collected (trigger catch)
                    // false = wrong answer (lose life)
                    if (result === null) {
                        // Correct letter but more remain - show particle effect
                        this.showCorrectLetterEffect();

                        // Delay UI update so particle effect is fully visible before redraw
                        this.scene.time.delayedCall(600, () => {
                            this.updateLetterDisplay();
                        });
                    } else if (result === false) {
                        // Wrong answer - show shake/red effect
                        this.showIncorrectLetterEffect();

                        // Delay callback until shake animation completes (400ms)
                        this.scene.time.delayedCall(450, () => {
                            if (this.answerCallback) {
                                this.answerCallback(result);
                            }
                        });
                    } else if (result === true) {
                        // All letters collected - turn green immediately, THEN show particle effect

                        // First, update display to show the final letter as green (removes yellow highlight)
                        this.updateLetterDisplay();

                        // Small delay to let the green letter render, then show particle effect
                        this.scene.time.delayedCall(50, () => {
                            this.showCorrectLetterEffect();
                        });

                        // Delay callback to allow particle effect to complete
                        this.scene.time.delayedCall(900, () => {
                            if (this.answerCallback) {
                                this.answerCallback(result);
                            }
                        });
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

        // Store scene reference
        this.scene = scene;

        // Restore collected letters state
        this.usedLetters = usedData.usedLetters || [];
        this.collectedIndices = new Set(usedData.collectedIndices || []);
        this.allLetterIndices = usedData.allLetterIndices || [];
        this.remainingIndices = usedData.remainingIndices || [];
        this.currentLetterPosition = usedData.currentLetterPosition || 0;

        // Update Pokemon name display to show collected letters
        this.updateLetterDisplay();

        // Note: updateLetterDisplay() now calls recreateLetterButtons() internally
        // No need to recreate buttons here separately
    }

    checkAnswer(selectedLetter) {
        if (selectedLetter === this.currentLetter) {
            // Correct letter! Add to collected
            this.collectedIndices.add(this.challengeData.highlightIndex);

            // Remove from remaining
            const indexInRemaining = this.remainingIndices.indexOf(this.challengeData.highlightIndex);
            if (indexInRemaining > -1) {
                this.remainingIndices.splice(indexInRemaining, 1);
            }

            // Move to next position
            this.currentLetterPosition++;

            // Check if all letters have been collected
            if (this.currentLetterPosition >= this.allLetterIndices.length) {
                // All letters collected! Return true to trigger pokeball catch
                return true;
            } else {
                // More letters remain - pick next SEQUENTIAL letter
                const nextIndex = this.allLetterIndices[this.currentLetterPosition];
                const normalizedName = this.challengeData.pokemonName.toUpperCase();
                this.currentLetter = normalizedName[nextIndex];
                this.challengeData.highlightIndex = nextIndex;
                this.challengeData.correctAnswer = this.currentLetter;

                // Clear used letters for the new letter challenge
                this.usedLetters = [];

                // Return null to indicate "correct but not done" - don't trigger callback
                return null;
            }
        } else {
            // Wrong letter - add to used letters
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

        // Reset state variables to prevent grayed-out letters from persisting
        this.usedLetters = [];
        this.collectedIndices = new Set();
        this.currentLetterPosition = 0;
    }

    getUsedData() {
        return {
            usedLetters: this.usedLetters,
            collectedIndices: Array.from(this.collectedIndices), // Convert Set to Array
            allLetterIndices: this.allLetterIndices,
            remainingIndices: this.remainingIndices,
            currentLetterPosition: this.currentLetterPosition
        };
    }
}
