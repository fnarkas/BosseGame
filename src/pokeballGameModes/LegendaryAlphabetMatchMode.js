import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { saveActiveMinigame, clearActiveMinigame } from '../minigameSession.js';
import { loadModeConfig } from '../minigameConfig.js';
import { COLORS, drawDashedRect, updateZoneHover } from './uiKit.js';

const DEFAULT_CONFIG = { coinReward: 100, maxErrors: 3 };
const BOX_COLOR = 0x4A90E2;
const BAR_WIDTH = 600;
const REVEAL_MS = 1000; // the correct zone glows while the letter is spoken

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
        this.progressBar = null;
        this.progressBarFill = null;
        this.legendaryBallIcon = null;

        // Default config (will be loaded from server)
        this.config = { ...DEFAULT_CONFIG };
        this.configLoaded = false;
        this.errorsRemaining = this.config.maxErrors; // Will be set from config
        this.gameOverScheduled = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('legendary', DEFAULT_CONFIG);
        if (!(config.coinReward >= 0)) config.coinReward = DEFAULT_CONFIG.coinReward;
        if (!(config.maxErrors > 0)) config.maxErrors = DEFAULT_CONFIG.maxErrors;
        this.config = config;
        this.errorsRemaining = this.config.maxErrors;
        this.configLoaded = true;
        console.log('LegendaryAlphabetMatchMode loaded config:', this.config);
    }

    generateChallenge() {
        this.challengeData = {
            letters: this.allLetters
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh board always starts accepting drops again
        this.inputLocked = false;
        this.isRevealing = false;
        this.gameOverScheduled = false;

        // Show hearts at the top
        this.createHearts(scene, { max: this.config.maxErrors, remaining: this.errorsRemaining, x: width / 2, y: 70 });

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
        const barHeight = 40;
        const barX = width / 2;
        const barY = height / 2; // Middle of screen

        // Progress bar background
        this.progressBar = scene.add.rectangle(barX, barY, BAR_WIDTH, barHeight, 0x333333);
        this.progressBar.setStrokeStyle(4, COLORS.REVEAL);
        this.uiElements.push(this.progressBar);

        // Progress bar fill (starts at 0 width). The bar alone shows progress:
        // the child can't read a "12/29" counter.
        this.progressBarFill = scene.add.rectangle(barX - BAR_WIDTH / 2, barY, 0, barHeight, COLORS.CORRECT);
        this.progressBarFill.setOrigin(0, 0.5);
        this.progressBarFill.setDepth(1);
        this.uiElements.push(this.progressBarFill);
        this.updateProgressBar();

        // Treasure chest to the right of the bar (prize indicator for legendary)
        this.legendaryBallIcon = scene.add.image(barX + BAR_WIDTH / 2 + 60, barY, 'treasure-chest');
        this.legendaryBallIcon.setOrigin(0.5);
        this.legendaryBallIcon.setScale(0.5); // Scale down to fit next to bar
        this.uiElements.push(this.legendaryBallIcon);
    }

    updateProgressBar() {
        if (!this.progressBarFill || !this.progressBarFill.scene) return;
        const progress = this.matchedCount / this.requiredMatches;
        this.progressBarFill.width = BAR_WIDTH * progress;
    }

    createDropZones(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 60;
        const spacing = 8;
        const lettersPerRow = 10;

        const totalWidth = lettersPerRow * (boxSize + spacing) - spacing;
        const startX = (width - totalWidth) / 2 + boxSize / 2;
        const startY = 160;

        this.allLetters.forEach((letter, index) => {
            const row = Math.floor(index / lettersPerRow);
            const col = index % lettersPerRow;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + spacing);

            // Drop zone background
            const dropZone = scene.add.rectangle(x, y, boxSize, boxSize, COLORS.NEUTRAL_FILL, 0.2);
            dropZone.setInteractive();
            dropZone.setData('letter', letter);
            dropZone.setData('matched', false);
            dropZone.setData('originalAlpha', 0.2);
            this.dropZones.push(dropZone);
            this.uiElements.push(dropZone);

            // Create dashed border
            const graphics = scene.add.graphics();
            graphics.lineStyle(2, COLORS.OUTLINE, 1);
            drawDashedRect(graphics, x - boxSize / 2, y - boxSize / 2, boxSize, boxSize, 6, 4);
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

    createDraggableLetters(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 60;
        const spacing = 8;
        const lettersPerRow = 10;

        const totalWidth = lettersPerRow * (boxSize + spacing) - spacing;
        const startX = (width - totalWidth) / 2 + boxSize / 2;
        const startY = 470;

        // Shuffle lowercase letters
        const shuffled = Phaser.Utils.Array.Shuffle([...this.allLetters]);

        shuffled.forEach((letter, index) => {
            const row = Math.floor(index / lettersPerRow);
            const col = index % lettersPerRow;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + spacing);

            // Draggable box
            const box = scene.add.rectangle(x, y, boxSize, boxSize, BOX_COLOR, 0.3);
            box.setStrokeStyle(3, BOX_COLOR);
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

                // Highlight the zone under the pointer
                updateZoneHover(this.dropZones, pointer);
            });

            box.on('dragend', (pointer) => {
                this.handleDrop(scene, box, pointer);
            });
        });

        // Enable dragging
        scene.input.setDraggable(this.draggableBoxes);
    }

    playLetterAudio(scene, letter) {
        this.playAudio(scene, `letter_audio_${letter.toLowerCase()}`);
    }

    snapBack(scene, draggedBox, letterText) {
        this.addTween(scene, {
            targets: [draggedBox, letterText],
            x: draggedBox.getData('startX'),
            y: draggedBox.getData('startY'),
            duration: 300,
            ease: 'Back.easeOut'
        });
    }

    resetZoneHover() {
        this.dropZones.forEach(zone => {
            if (!zone.getData('matched')) {
                zone.setFillStyle(COLORS.NEUTRAL_FILL, zone.getData('originalAlpha'));
            }
        });
    }

    handleDrop(scene, draggedBox, pointer) {
        const letter = draggedBox.getData('letter');
        const letterText = draggedBox.getData('letterText');
        let matched = false;
        let droppedOnWrongZone = false;

        // While a wrong drop is being shaken (or the game is over) nothing
        // counts: the box just goes home again.
        if (this.isInputBlocked()) {
            this.snapBack(scene, draggedBox, letterText);
            this.resetZoneHover();
            return;
        }

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
                    draggedBox.setStrokeStyle(3, COLORS.CORRECT);
                    draggedBox.setFillStyle(COLORS.CORRECT, 0.3);
                    draggedBox.disableInteractive();

                    zone.setFillStyle(COLORS.CORRECT, 0.2);

                    // Remove dashed border and add solid green border
                    const dashedBorder = zone.getData('dashedBorder');
                    if (dashedBorder) {
                        dashedBorder.destroy();
                    }
                    zone.setStrokeStyle(4, COLORS.CORRECT);

                    // Animation
                    this.addTween(scene, {
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
                            if (upperText && upperText.scene) {
                                upperText.setText(`${letter}${letter.toLowerCase()}`);
                                upperText.setColor('#27AE60');
                            }
                        }
                    });

                    this.matchedCount++;
                    this.updateProgressBar();

                    // Check if all matched
                    if (this.matchedCount >= this.requiredMatches) {
                        this.inputLocked = true;
                        this.delayedCall(scene, 800, () => {
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
                this.handleWrongDrop(scene, draggedBox, letterText);
            } else {
                // Just dropped outside zones - return to start
                this.snapBack(scene, draggedBox, letterText);
            }

            // Reset hover effects
            this.resetZoneHover();
        }
    }

    handleWrongDrop(scene, draggedBox, letterText) {
        const letter = draggedBox.getData('letter');

        // Wrong match - lose a heart
        this.errorsRemaining = Math.max(0, this.errorsRemaining - 1);
        const outOfHearts = this.errorsRemaining <= 0;
        this.updateHearts(this.errorsRemaining);

        // No more drops count until the feedback is over (for good if that
        // was the last heart)
        this.inputLocked = true;

        // Red flash and shake on the box and its letter
        letterText.setColor('#FF0000');
        this.addTween(scene, {
            targets: letterText,
            x: letterText.x - 10,
            duration: 50,
            yoyo: true,
            repeat: 3
        });

        this.shakeWrong(scene, draggedBox, {
            restore: false,
            onComplete: () => {
                if (!draggedBox.scene) return;
                // Clear red tint
                letterText.setColor('#FFFFFF');
                draggedBox.setStrokeStyle(3, BOX_COLOR);
                draggedBox.setFillStyle(BOX_COLOR, 0.3);

                // Return to start while the right zone is shown
                this.snapBack(scene, draggedBox, letterText);
                this.revealCorrectZone(scene, letter, outOfHearts);
            }
        });
    }

    revealCorrectZone(scene, letter, outOfHearts) {
        const zone = this.dropZones.find(z => z.getData('letter') === letter);

        // Gold glow on the capital this letter belongs to
        if (zone && zone.scene) {
            zone.setFillStyle(COLORS.REVEAL, 0.5);
            this.addTween(scene, {
                targets: zone,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 250,
                yoyo: true,
                repeat: 1,
                ease: 'Sine.easeInOut'
            });
        }

        // Say the letter while the child looks at its capital, then either
        // carry on or, with no hearts left, hand over to the next mode. The
        // streak is untouched: legendary rounds use hearts instead.
        this.revealAnswer(scene, {
            targets: [],
            audioKey: `letter_audio_${letter.toLowerCase()}`,
            delay: REVEAL_MS,
            onDone: () => {
                if (zone && zone.scene && !zone.getData('matched')) {
                    zone.setFillStyle(COLORS.NEUTRAL_FILL, zone.getData('originalAlpha'));
                }
                if (outOfHearts) {
                    if (!this.gameOverScheduled) {
                        this.gameOverScheduled = true;
                        this.handleGameOver(scene);
                    }
                } else {
                    this.isRevealing = false;
                    this.inputLocked = false;
                }
            }
        });
    }

    async handleGameOver(scene) {
        console.log('💔 Game Over - All hearts lost!');

        // Clean up current UI
        this.cleanup(scene);

        // Reset state for next time
        this.matchedCount = 0;
        this.errorsRemaining = this.config.maxErrors;

        // Force scene to switch to next mode by calling the same logic as
        // completion but without awarding coins. selectGameMode() is async
        // (it fetches the wheel weights), so wait for it: the callback and the
        // wheel must go to the NEW mode, not to this one.
        clearActiveMinigame();
        scene.challengeCount++;
        await scene.selectGameMode();

        // Set up callback for new mode
        scene.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
            scene.handleAnswer(isCorrect, answer, x, y);
        });

        // Show dice animation for next mode
        const forcedMode = scene.registry.get('pokeballGameMode');
        if (!forcedMode) {
            // Remember the newly rolled mode so a reload doesn't resume this one
            saveActiveMinigame(scene.gameMode.constructor.name);
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
        this.finish(true, 'legendary-complete', x, y);
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.dropZones = [];
        this.draggableLetters = [];
        this.draggableBoxes = [];
        this.matchedCount = 0;
        this.progressBar = null;
        this.progressBarFill = null;
        this.legendaryBallIcon = null;
    }

    // Debug method to complete the game instantly
    debugComplete(scene) {
        console.log('🐛 Debug: Completing legendary challenge instantly');
        this.matchedCount = this.requiredMatches;
        this.updateProgressBar();
        this.inputLocked = true;
        this.delayedCall(scene, 500, () => {
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
