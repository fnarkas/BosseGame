import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { addCoins } from '../currency.js';

/**
 * Legendary Alphabet Match Mode
 * Player must match ALL uppercase letters (A-Z,Å,Ä,Ö) with their lowercase counterparts
 * Success awards coins (configurable)
 */
export class LegendaryAlphabetMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.allLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
            'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];
        this.matchedCount = 0;
        this.requiredMatches = 29; // All 29 Swedish letters
        this.dropZones = [];
        this.draggableLetters = [];
        this.draggableBoxes = [];
        this.currentHoverZone = null;
        this.progressBar = null;
        this.progressBarFill = null;
        this.progressText = null;
        this.legendaryBallIcon = null;
        this.heartsDisplay = null;

        // Default config (will be loaded from server)
        this.config = {
            coinReward: 100,
            maxErrors: 3
        };
        this.configLoaded = false;
        this.errorsRemaining = 3; // Will be set from config
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                if (serverConfig.legendary) {
                    this.config.coinReward = serverConfig.legendary.coinReward || this.config.coinReward;
                    this.config.maxErrors = serverConfig.legendary.maxErrors || this.config.maxErrors;
                    this.errorsRemaining = this.config.maxErrors;
                    console.log('LegendaryAlphabetMatchMode loaded config:', this.config);
                }
            }
        } catch (error) {
            console.warn('Failed to load legendary config, using defaults:', error);
        }
        this.configLoaded = true;
    }

    generateChallenge() {
        this.challengeData = {
            letters: this.allLetters
        };
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

        // Create uppercase drop zones (3 rows of 10)
        this.createDropZones(scene);

        // Create progress bar in middle
        this.createProgressBar(scene);

        // Create lowercase draggables (3 rows of 10, shuffled)
        this.createDraggableLetters(scene);
    }

    createProgressBar(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;
        const barWidth = 600;
        const barHeight = 40;
        const barX = width / 2;
        const barY = height / 2; // Middle of screen

        // Progress bar background
        this.progressBar = scene.add.rectangle(barX, barY, barWidth, barHeight, 0x333333);
        this.progressBar.setStrokeStyle(4, 0xFFD700);
        this.uiElements.push(this.progressBar);

        // Progress bar fill (starts at 0 width)
        this.progressBarFill = scene.add.rectangle(barX - barWidth / 2, barY, 0, barHeight, 0x27AE60);
        this.progressBarFill.setOrigin(0, 0.5);
        this.progressBarFill.setDepth(1);
        this.uiElements.push(this.progressBarFill);

        // Progress text
        this.progressText = scene.add.text(barX, barY, '0/29', {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        this.progressText.setDepth(2);
        this.uiElements.push(this.progressText);

        // Treasure chest to the right of the bar (prize indicator for legendary)
        this.legendaryBallIcon = scene.add.image(barX + barWidth / 2 + 60, barY, 'treasure-chest');
        this.legendaryBallIcon.setOrigin(0.5);
        this.legendaryBallIcon.setScale(0.5); // Scale down to fit next to bar
        this.uiElements.push(this.legendaryBallIcon);
    }

    updateProgressBar() {
        const barWidth = 600;
        const progress = this.matchedCount / this.requiredMatches;
        this.progressBarFill.width = barWidth * progress;
        this.progressText.setText(`${this.matchedCount}/29`);
    }

    createDropZones(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 60;
        const spacing = 8;
        const lettersPerRow = 10;
        const rows = 3;

        const totalWidth = lettersPerRow * (boxSize + spacing) - spacing;
        const startX = (width - totalWidth) / 2 + boxSize / 2;
        const startY = 160;

        this.allLetters.forEach((letter, index) => {
            const row = Math.floor(index / lettersPerRow);
            const col = index % lettersPerRow;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + spacing);

            // Drop zone background
            const dropZone = scene.add.rectangle(x, y, boxSize, boxSize, 0xFFFFFF, 0.2);
            dropZone.setInteractive();
            dropZone.setData('letter', letter);
            dropZone.setData('matched', false);
            dropZone.setData('originalAlpha', 0.2);
            this.dropZones.push(dropZone);
            this.uiElements.push(dropZone);

            // Create dashed border
            const graphics = scene.add.graphics();
            graphics.lineStyle(2, 0x000000, 1);
            const dashLength = 6;
            const gapLength = 4;
            this.drawDashedRect(graphics, x - boxSize / 2, y - boxSize / 2, boxSize, boxSize, dashLength, gapLength);
            dropZone.setData('dashedBorder', graphics);
            this.uiElements.push(graphics);

            // Uppercase letter text
            const upperText = scene.add.text(x, y, letter, {
                fontSize: '40px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            dropZone.setData('upperText', upperText);
            this.uiElements.push(upperText);
        });
    }

    drawDashedRect(graphics, x, y, width, height, dashLength, gapLength) {
        const perimeter = [
            { x1: x, y1: y, x2: x + width, y2: y }, // Top
            { x1: x + width, y1: y, x2: x + width, y2: y + height }, // Right
            { x1: x + width, y1: y + height, x2: x, y2: y + height }, // Bottom
            { x1: x, y1: y + height, x2: x, y2: y } // Left
        ];

        perimeter.forEach(line => {
            const dx = line.x2 - line.x1;
            const dy = line.y2 - line.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.floor(length / (dashLength + gapLength));

            for (let i = 0; i < steps; i++) {
                const t1 = i * (dashLength + gapLength) / length;
                const t2 = (i * (dashLength + gapLength) + dashLength) / length;

                const startX = line.x1 + dx * t1;
                const startY = line.y1 + dy * t1;
                const endX = line.x1 + dx * t2;
                const endY = line.y1 + dy * t2;

                graphics.lineBetween(startX, startY, endX, endY);
            }
        });
    }

    createDraggableLetters(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 60;
        const spacing = 8;
        const lettersPerRow = 10;

        const totalWidth = lettersPerRow * (boxSize + spacing) - spacing;
        const startX = (width - totalWidth) / 2 + boxSize / 2;
        const startY = 470;

        // Shuffle lowercase letters
        const shuffled = [...this.allLetters].sort(() => Math.random() - 0.5);

        shuffled.forEach((letter, index) => {
            const row = Math.floor(index / lettersPerRow);
            const col = index % lettersPerRow;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + spacing);

            // Draggable box
            const box = scene.add.rectangle(x, y, boxSize, boxSize, 0x4A90E2, 0.3);
            box.setStrokeStyle(3, 0x4A90E2);
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('letter', letter);
            box.setData('startX', x);
            box.setData('startY', y);
            this.draggableBoxes.push(box);
            this.uiElements.push(box);

            // Lowercase letter text
            const lowerText = scene.add.text(x, y, letter.toLowerCase(), {
                fontSize: '40px',
                fontFamily: 'Arial',
                color: '#FFFFFF',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            box.setData('letterText', lowerText);
            this.draggableLetters.push(lowerText);
            this.uiElements.push(lowerText);

            // Drag events
            box.on('drag', (pointer, dragX, dragY) => {
                box.x = dragX;
                box.y = dragY;
                lowerText.x = dragX;
                lowerText.y = dragY;

                // Check hover over drop zones
                this.checkHoverOverZones(scene, pointer);
            });

            box.on('dragend', (pointer) => {
                this.handleDrop(scene, box, pointer);
            });
        });

        // Enable dragging
        scene.input.setDraggable(this.draggableBoxes);
    }

    playLetterAudio(scene, letter) {
        const audioKey = `letter_audio_${letter.toLowerCase()}`;
        if (scene.cache.audio.exists(audioKey)) {
            scene.sound.play(audioKey);
        } else {
            console.warn(`Audio not found for letter: ${letter}`);
        }
    }

    checkHoverOverZones(scene, pointer) {
        let foundHover = false;

        this.dropZones.forEach(zone => {
            const bounds = zone.getBounds();
            const isOver = Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);

            if (isOver && !zone.getData('matched')) {
                zone.setFillStyle(0xFFD700, 0.5); // Gold hover
                foundHover = true;
                this.currentHoverZone = zone;
            } else if (!zone.getData('matched')) {
                zone.setFillStyle(0xFFFFFF, zone.getData('originalAlpha'));
            }
        });

        if (!foundHover && this.currentHoverZone) {
            this.currentHoverZone = null;
        }
    }

    handleDrop(scene, draggedBox, pointer) {
        const letter = draggedBox.getData('letter');
        const letterText = draggedBox.getData('letterText');
        let matched = false;
        let droppedOnWrongZone = false;

        // Check if dropped on correct zone
        this.dropZones.forEach(zone => {
            const zoneLetter = zone.getData('letter');
            const alreadyMatched = zone.getData('matched');
            const bounds = zone.getBounds();

            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                if (!alreadyMatched && zoneLetter === letter) {
                    // Correct match!
                    matched = true;
                    zone.setData('matched', true);

                    // Play letter audio
                    this.playLetterAudio(scene, letter);

                    // Snap to zone position
                    draggedBox.x = zone.x;
                    draggedBox.y = zone.y;
                    letterText.x = zone.x;
                    letterText.y = zone.y;

                    // Visual feedback
                    letterText.setColor('#27AE60');
                    draggedBox.setStrokeStyle(3, 0x27AE60);
                    draggedBox.setFillStyle(0x27AE60, 0.3);
                    draggedBox.disableInteractive();

                    zone.setFillStyle(0x27AE60, 0.2);

                    // Remove dashed border and add solid green border
                    const dashedBorder = zone.getData('dashedBorder');
                    if (dashedBorder) {
                        dashedBorder.destroy();
                    }
                    zone.setStrokeStyle(4, 0x27AE60);

                    // Animation
                    scene.tweens.add({
                        targets: [draggedBox, letterText],
                        scale: 1.3,
                        duration: 200,
                        yoyo: true,
                        onComplete: () => {
                            // Hide dragged elements
                            draggedBox.setVisible(false);
                            letterText.setVisible(false);

                            // Update zone text to show both cases
                            const upperText = zone.getData('upperText');
                            if (upperText) {
                                upperText.setText(`${letter}${letter.toLowerCase()}`);
                                upperText.setColor('#27AE60');
                            }
                        }
                    });

                    this.matchedCount++;
                    this.updateProgressBar();

                    // Check if all matched
                    if (this.matchedCount >= this.requiredMatches) {
                        scene.time.delayedCall(800, () => {
                            this.handleCompletion(scene);
                        });
                    }
                } else if (!alreadyMatched) {
                    // Wrong zone! (letter doesn't match)
                    droppedOnWrongZone = true;
                }
            }
        });

        // If not matched, return to start
        if (!matched) {
            if (droppedOnWrongZone) {
                // Wrong match - lose a heart
                this.errorsRemaining = Math.max(0, this.errorsRemaining - 1);

                // Update hearts display (clamp to prevent negative values)
                const heartsText = '❤️'.repeat(Math.max(0, this.errorsRemaining)) + '🖤'.repeat(this.config.maxErrors - this.errorsRemaining);
                if (this.heartsDisplay) {
                    this.heartsDisplay.setText(heartsText);
                }

                // Red flash and shake
                letterText.setColor('#FF0000');
                draggedBox.setStrokeStyle(3, 0xFF0000);
                draggedBox.setFillStyle(0xFF0000, 0.3);

                const originalX = draggedBox.x;
                scene.tweens.add({
                    targets: [draggedBox, letterText],
                    x: originalX - 10,
                    duration: 50,
                    yoyo: true,
                    repeat: 3,
                    onComplete: () => {
                        // Clear red tint
                        letterText.setColor('#FFFFFF');
                        draggedBox.setStrokeStyle(3, 0x4A90E2);
                        draggedBox.setFillStyle(0x4A90E2, 0.3);

                        // Return to start
                        scene.tweens.add({
                            targets: [draggedBox, letterText],
                            x: draggedBox.getData('startX'),
                            y: draggedBox.getData('startY'),
                            duration: 300,
                            ease: 'Back.easeOut'
                        });

                        // Check if out of hearts
                        if (this.errorsRemaining <= 0) {
                            // Game over - restart
                            scene.time.delayedCall(1000, () => {
                                this.handleGameOver(scene);
                            });
                        }
                    }
                });
            } else {
                // Just dropped outside zones - return to start
                scene.tweens.add({
                    targets: [draggedBox, letterText],
                    x: draggedBox.getData('startX'),
                    y: draggedBox.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut'
                });
            }

            // Reset hover effects
            this.dropZones.forEach(zone => {
                if (!zone.getData('matched')) {
                    zone.setFillStyle(0xFFFFFF, zone.getData('originalAlpha'));
                }
            });
        }
    }

    handleGameOver(scene) {
        console.log('💔 Game Over - All hearts lost!');

        // Clean up current UI
        this.cleanup(scene);

        // Reset state for next time
        this.matchedCount = 0;
        this.errorsRemaining = this.config.maxErrors;

        // Force scene to switch to next mode by calling the same logic as completion
        // but without awarding coins
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
        // Don't add coins here - let handleAnswer do it with the reward animation
        console.log(`🎁 Legendary challenge complete! Reward: ${this.config.coinReward} coins`);

        // Return to main game - let the standard coin reward animation handle it
        const x = scene.cameras.main.width / 2;
        const y = scene.cameras.main.height / 2;
        this.answerCallback(true, 'legendary-complete', x, y);
    }

    cleanup(scene) {
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.dropZones = [];
        this.draggableLetters = [];
        this.draggableBoxes = [];
        this.matchedCount = 0;
        this.currentHoverZone = null;
    }

    // Debug method to complete the game instantly
    debugComplete(scene) {
        console.log('🐛 Debug: Completing legendary challenge instantly');
        this.matchedCount = this.requiredMatches;
        this.updateProgressBar();
        scene.time.delayedCall(500, () => {
            this.handleCompletion(scene);
        });
    }
}

// Make debug method globally accessible
if (typeof window !== 'undefined') {
    window.completeLegendary = function() {
        console.log('🐛 Looking for active legendary game mode...');
        // Access the Phaser game instance
        if (window.phaserGame && window.phaserGame.scene) {
            const scenes = window.phaserGame.scene.getScenes(true);
            const pokeballScene = scenes.find(s => s.scene.key === 'PokeballGameScene');
            if (pokeballScene && pokeballScene.gameMode && pokeballScene.gameMode.constructor.name === 'LegendaryAlphabetMatchMode') {
                pokeballScene.gameMode.debugComplete(pokeballScene);
                console.log('✅ Legendary challenge completed!');
            } else {
                console.warn('❌ Legendary mode not currently active');
            }
        } else {
            console.warn('❌ Game not found');
        }
    };
}
