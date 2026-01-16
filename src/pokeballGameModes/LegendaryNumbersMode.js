import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { showNumberProgressPopup } from './numberProgressPopup.js';

/**
 * Legendary Numbers Mode
 * Player must correctly identify all numbers from 0-99
 * Similar to NumberListeningMode but with progress tracking and matrix visualization
 */
export class LegendaryNumbersMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.numbersRange = { min: 0, max: 99 }; // 0-99 = 100 numbers
        this.clearedNumbers = new Set();
        this.currentNumber = null;
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];
        this.currentAudio = null;
        this.isRevealing = false;
        this.heartsDisplay = null;
        this.numberMatrix = null;
        this.speakerButton = null;

        // Default config (will be loaded from server)
        this.config = {
            coinReward: 200,
            maxErrors: 5
        };
        this.configLoaded = false;
        this.errorsRemaining = 5;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                if (serverConfig.legendaryNumbers) {
                    this.config.coinReward = serverConfig.legendaryNumbers.coinReward || this.config.coinReward;
                    this.config.maxErrors = serverConfig.legendaryNumbers.maxErrors || this.config.maxErrors;
                    this.errorsRemaining = this.config.maxErrors;
                    console.log('LegendaryNumbersMode loaded config:', this.config);
                }
            }
        } catch (error) {
            console.warn('Failed to load legendary numbers config, using defaults:', error);
        }
        this.configLoaded = true;
    }

    getTotalNumbers() {
        return this.numbersRange.max - this.numbersRange.min + 1; // 100 numbers (0-99)
    }

    generateChallenge() {
        // Pick a random number that hasn't been cleared yet
        const unclearedNumbers = [];
        for (let i = this.numbersRange.min; i <= this.numbersRange.max; i++) {
            if (!this.clearedNumbers.has(i)) {
                unclearedNumbers.push(i);
            }
        }

        if (unclearedNumbers.length === 0) {
            // All numbers cleared - this shouldn't happen as we check completion
            this.currentNumber = this.numbersRange.min;
        } else {
            const randomIndex = Math.floor(Math.random() * unclearedNumbers.length);
            this.currentNumber = unclearedNumbers[randomIndex];
        }

        this.challengeData = {
            number: this.currentNumber,
            tens: Math.floor(this.currentNumber / 10),
            ones: this.currentNumber % 10
        };

        console.log('Generated legendary number challenge:', this.currentNumber);
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Show hearts at the top
        const heartsText = '❤️'.repeat(this.errorsRemaining) + '🖤'.repeat(this.config.maxErrors - this.errorsRemaining);
        this.heartsDisplay = scene.add.text(width / 2, 70, heartsText, {
            fontSize: '36px',
            fontFamily: 'Arial'
        }).setOrigin(0.5);
        this.uiElements.push(this.heartsDisplay);

        // Create drop zones for tens and ones (at top)
        this.createDropZones(scene);

        // Update drop zone visibility based on current number
        this.updateDropZoneVisibility();

        // Create number matrix visualization between drop zones and digit boxes
        this.createNumberMatrix(scene);

        // Create speaker button to replay audio
        this.createSpeakerButton(scene);

        // Create draggable digit boxes (0-9) at bottom
        this.createDigitBoxes(scene);

        // Play audio for the current number
        this.playNumberAudio(scene);
    }


    createNumberMatrix(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Matrix positioned between drop zones and digit boxes
        const matrixX = width / 2;
        const matrixY = height / 2 + 20; // Centered vertically between top zones and bottom digits
        const cellSize = 18; // Much smaller
        const cols = 10; // 10 columns (0-9 for ones digit)
        const rows = 10; // 10 rows (0-9, 10-19, 20-29, ..., 80-89, 90-99)

        const matrixWidth = cols * cellSize;
        const matrixHeight = rows * cellSize;

        // Background for matrix - make it interactive
        const matrixBg = scene.add.rectangle(matrixX, matrixY, matrixWidth + 12, matrixHeight + 12, 0x000000, 0.7);
        matrixBg.setOrigin(0.5);
        matrixBg.setInteractive({ useHandCursor: true });
        matrixBg.on('pointerdown', () => {
            this.showMatrixPopup();
        });
        this.uiElements.push(matrixBg);

        this.numberMatrix = [];

        // Create grid of number cells (0-99)
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const number = row * 10 + col; // 0-99

                // Only show numbers 0-99
                if (number > 99) continue;

                const x = matrixX - matrixWidth / 2 + col * cellSize + cellSize / 2;
                const y = matrixY - matrixHeight / 2 + row * cellSize + cellSize / 2;

                // Cell background - just colored squares, no text
                const isCleared = this.clearedNumbers.has(number);
                const cell = scene.add.rectangle(x, y, cellSize - 3, cellSize - 3, isCleared ? 0x27AE60 : 0x555555, 0.9);
                cell.setInteractive({ useHandCursor: true });
                cell.on('pointerdown', () => {
                    this.showMatrixPopup();
                });
                this.uiElements.push(cell);

                this.numberMatrix.push({ number, cell });
            }
        }
    }

    showMatrixPopup() {
        showNumberProgressPopup(
            this.clearedNumbers,
            this.numbersRange.min,
            this.numbersRange.max,
            'Progress: Numbers 0-99'
        );
    }

    updateNumberMatrix(clearedNumber) {
        const entry = this.numberMatrix.find(e => e.number === clearedNumber);
        if (entry) {
            entry.cell.setFillStyle(0x27AE60, 0.9);
        }
    }

    createSpeakerButton(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Speaker button to replay audio - positioned next to matrix
        const speakerX = width / 2 + 140;
        const speakerY = height / 2 + 20;

        this.speakerButton = scene.add.text(speakerX, speakerY, '🔊', {
            fontSize: '48px',
            fontFamily: 'Arial'
        }).setOrigin(0.5);
        this.speakerButton.setInteractive({ useHandCursor: true });
        this.speakerButton.on('pointerdown', () => {
            this.playNumberAudio(scene);
        });
        this.uiElements.push(this.speakerButton);
    }

    createDropZones(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        const zoneWidth = 120;
        const zoneHeight = 120;
        const spacing = 40;
        const centerX = width / 2;
        const centerY = 200; // Move to top area

        // Tens zone (left)
        const tensX = centerX - zoneWidth / 2 - spacing / 2;
        this.tensZone = scene.add.rectangle(tensX, centerY, zoneWidth, zoneHeight, 0xFFFFFF, 0.2);
        this.tensZone.setStrokeStyle(4, 0xFFFFFF, 1);
        this.tensZone.setData('digit', 'tens');
        this.tensZone.setData('value', null);
        this.uiElements.push(this.tensZone);

        // Tens zone label
        const tensLabel = scene.add.text(tensX, centerY, '', {
            fontSize: '72px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.tensZone.setData('label', tensLabel);
        this.uiElements.push(tensLabel);

        // Ones zone (right)
        const onesX = centerX + zoneWidth / 2 + spacing / 2;
        this.onesZone = scene.add.rectangle(onesX, centerY, zoneWidth, zoneHeight, 0xFFFFFF, 0.2);
        this.onesZone.setStrokeStyle(4, 0xFFFFFF, 1);
        this.onesZone.setData('digit', 'ones');
        this.onesZone.setData('value', null);
        this.uiElements.push(this.onesZone);

        // Ones zone label
        const onesLabel = scene.add.text(onesX, centerY, '', {
            fontSize: '72px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.onesZone.setData('label', onesLabel);
        this.uiElements.push(onesLabel);
    }

    updateDropZoneVisibility() {
        // For single-digit numbers (0-9), hide the tens zone
        const isSingleDigit = this.currentNumber < 10;

        if (isSingleDigit) {
            this.tensZone.setVisible(false);
            this.tensZone.getData('label').setVisible(false);
            this.onesZone.setVisible(true);
            this.onesZone.getData('label').setVisible(true);
        } else {
            this.tensZone.setVisible(true);
            this.tensZone.getData('label').setVisible(true);
            this.onesZone.setVisible(true);
            this.onesZone.getData('label').setVisible(true);
        }
    }

    createDigitBoxes(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        const boxSize = 80;
        const spacing = 20;
        const cols = 5;
        const startY = height - 160; // Keep at bottom

        for (let i = 0; i <= 9; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = width / 2 - (cols * (boxSize + spacing)) / 2 + col * (boxSize + spacing) + boxSize / 2;
            const y = startY + row * (boxSize + spacing);

            // Box background
            const box = scene.add.rectangle(x, y, boxSize, boxSize, 0x3498DB, 0.8);
            box.setStrokeStyle(3, 0xFFFFFF);
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('digit', i);
            box.setData('startX', x);
            box.setData('startY', y);
            this.digitBoxes.push(box);
            this.uiElements.push(box);

            // Digit text
            const digitText = scene.add.text(x, y, i.toString(), {
                fontSize: '48px',
                fontFamily: 'Arial',
                color: '#FFFFFF',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            // Drag events
            box.on('drag', (pointer, dragX, dragY) => {
                box.x = dragX;
                box.y = dragY;
                digitText.x = dragX;
                digitText.y = dragY;

                // Highlight drop zones on hover
                this.checkHoverOverZones(scene, pointer);
            });

            box.on('dragend', (pointer) => {
                this.handleDrop(scene, box, pointer);
            });
        }

        scene.input.setDraggable(this.digitBoxes);
    }

    checkHoverOverZones(scene, pointer) {
        const zones = [this.tensZone, this.onesZone];
        zones.forEach(zone => {
            const bounds = zone.getBounds();
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                zone.setFillStyle(0xFFD700, 0.5);
            } else {
                zone.setFillStyle(0xFFFFFF, 0.2);
            }
        });
    }

    handleDrop(scene, box, pointer) {
        if (this.isRevealing) return;

        const digit = box.getData('digit');
        const text = box.getData('text');
        const isSingleDigit = this.currentNumber < 10;

        // Check if dropped on tens zone (only if visible for 2-digit numbers)
        if (!isSingleDigit && this.tensZone.visible) {
            const tensBounds = this.tensZone.getBounds();
            if (Phaser.Geom.Rectangle.Contains(tensBounds, pointer.x, pointer.y)) {
                this.tensZone.setData('value', digit);
                const label = this.tensZone.getData('label');
                label.setText(digit.toString());
                this.tensZone.setFillStyle(0xFFFFFF, 0.2);
            }
        }

        // Check if dropped on ones zone
        const onesBounds = this.onesZone.getBounds();
        if (Phaser.Geom.Rectangle.Contains(onesBounds, pointer.x, pointer.y)) {
            this.onesZone.setData('value', digit);
            const label = this.onesZone.getData('label');
            label.setText(digit.toString());
            this.onesZone.setFillStyle(0xFFFFFF, 0.2);
        }

        // Always return digit box to start position (numbers are reusable)
        scene.tweens.add({
            targets: [box, text],
            x: box.getData('startX'),
            y: box.getData('startY'),
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Reset zone highlights
        this.tensZone.setFillStyle(0xFFFFFF, 0.2);
        this.onesZone.setFillStyle(0xFFFFFF, 0.2);

        // Check if answer is complete
        if (isSingleDigit) {
            // For single-digit, only need ones zone
            const onesValue = this.onesZone.getData('value');
            if (onesValue !== null) {
                this.checkAnswer(scene);
            }
        } else {
            // For double-digit, need both zones
            const tensValue = this.tensZone.getData('value');
            const onesValue = this.onesZone.getData('value');
            if (tensValue !== null && onesValue !== null) {
                this.checkAnswer(scene);
            }
        }
    }

    checkAnswer(scene) {
        if (this.isRevealing) return;

        const isSingleDigit = this.currentNumber < 10;
        let guessedNumber;

        if (isSingleDigit) {
            // For single-digit numbers, only use ones zone
            guessedNumber = this.onesZone.getData('value');
        } else {
            // For double-digit numbers, combine tens and ones
            const tensValue = this.tensZone.getData('value');
            const onesValue = this.onesZone.getData('value');
            guessedNumber = tensValue * 10 + onesValue;
        }

        console.log(`Guessed: ${guessedNumber}, Correct: ${this.currentNumber}`);

        if (guessedNumber === this.currentNumber) {
            // Correct!
            this.handleCorrectAnswer(scene);
        } else {
            // Wrong!
            this.handleWrongAnswer(scene, guessedNumber);
        }
    }

    handleCorrectAnswer(scene) {
        this.isRevealing = true;

        // Add to cleared numbers
        this.clearedNumbers.add(this.currentNumber);

        // Update matrix
        this.updateNumberMatrix(this.currentNumber);

        // Visual feedback - green flash
        this.tensZone.setFillStyle(0x27AE60, 0.6);
        this.onesZone.setFillStyle(0x27AE60, 0.6);

        scene.time.delayedCall(500, () => {
            // Check if all numbers cleared
            if (this.clearedNumbers.size >= this.getTotalNumbers()) {
                this.handleCompletion(scene);
            } else {
                // Reset and continue
                this.resetZones(scene);
                this.generateChallenge();
                this.updateDropZoneVisibility();
                this.playNumberAudio(scene);
                this.isRevealing = false;
            }
        });
    }

    handleWrongAnswer(scene, guessedNumber) {
        this.isRevealing = true;

        // Lose a heart
        this.errorsRemaining = Math.max(0, this.errorsRemaining - 1);

        // Update hearts display
        const heartsText = '❤️'.repeat(Math.max(0, this.errorsRemaining)) + '🖤'.repeat(this.config.maxErrors - this.errorsRemaining);
        if (this.heartsDisplay) {
            this.heartsDisplay.setText(heartsText);
        }

        // Visual feedback - red flash
        this.tensZone.setFillStyle(0xFF0000, 0.6);
        this.onesZone.setFillStyle(0xFF0000, 0.6);

        scene.time.delayedCall(1000, () => {
            // Check if out of hearts
            if (this.errorsRemaining <= 0) {
                this.handleGameOver(scene);
            } else {
                // Reset and try again with same number
                this.resetZones(scene);
                this.updateDropZoneVisibility();
                this.playNumberAudio(scene);
                this.isRevealing = false;
            }
        });
    }

    resetZones(scene) {
        // Clear zone data and labels
        this.tensZone.setData('value', null);
        this.onesZone.setData('value', null);
        this.tensZone.getData('label').setText('');
        this.onesZone.getData('label').setText('');
        this.tensZone.setFillStyle(0xFFFFFF, 0.2);
        this.onesZone.setFillStyle(0xFFFFFF, 0.2);
    }

    playNumberAudio(scene) {
        if (this.currentAudio && this.currentAudio.isPlaying) {
            this.currentAudio.stop();
        }

        const audioKey = `number_audio_${this.currentNumber}`;
        if (scene.cache.audio.exists(audioKey)) {
            this.currentAudio = scene.sound.add(audioKey);
            this.currentAudio.play();
        } else {
            console.warn(`Audio not found for number: ${this.currentNumber}`);
        }
    }

    handleGameOver(scene) {
        console.log('💔 Game Over - All hearts lost!');

        // Clean up current UI
        this.cleanup(scene);

        // Reset state for next time
        this.clearedNumbers.clear();
        this.errorsRemaining = this.config.maxErrors;

        // Force scene to switch to next mode
        scene.gameMode.cleanup(scene);
        scene.challengeCount++;
        scene.selectGameMode();

        // Set up callback for new mode
        scene.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
            scene.handleAnswer(isCorrect, answer, x, y);
        });

        // Show dice animation for next mode
        const forcedMode = scene.registry.get('pokeballGameMode');
        if (!forcedMode) {
            scene.showDiceRollAnimation();
        } else {
            // If in debug mode for legendary only, go back to main scene
            scene.scene.start('MainGameScene');
        }
    }

    handleCompletion(scene) {
        console.log(`🎁 Legendary Numbers complete! Reward: ${this.config.coinReward} coins`);

        // Return to main game - let the standard coin reward animation handle it
        const x = scene.cameras.main.width / 2;
        const y = scene.cameras.main.height / 2;
        this.answerCallback(true, 'legendary-numbers-complete', x, y);
    }

    cleanup(scene) {
        if (this.currentAudio) {
            if (this.currentAudio.isPlaying) {
                this.currentAudio.stop();
            }
            this.currentAudio.destroy();
            this.currentAudio = null;
        }

        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });

        this.uiElements = [];
        this.digitBoxes = [];
        this.tensZone = null;
        this.onesZone = null;
        this.numberMatrix = null;
        this.speakerButton = null;
        this.isRevealing = false;
    }
}

// Make debug method globally accessible
if (typeof window !== 'undefined') {
    window.completeLegendaryNumbers = function() {
        console.log('🐛 Looking for active legendary numbers game mode...');
        if (window.phaserGame && window.phaserGame.scene) {
            const scenes = window.phaserGame.scene.getScenes(true);
            const pokeballScene = scenes.find(s => s.scene.key === 'PokeballGameScene');
            if (pokeballScene && pokeballScene.gameMode && pokeballScene.gameMode.constructor.name === 'LegendaryNumbersMode') {
                // Complete all numbers instantly
                for (let i = pokeballScene.gameMode.numbersRange.min; i <= pokeballScene.gameMode.numbersRange.max; i++) {
                    pokeballScene.gameMode.clearedNumbers.add(i);
                }
                pokeballScene.gameMode.handleCompletion(pokeballScene);
                console.log('✅ Legendary numbers challenge completed!');
            } else {
                console.log('❌ Legendary numbers game not found');
            }
        }
    };
}
