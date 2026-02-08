import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';

// Swedish days of the week with their numbers
const DAYS_OF_WEEK = [
    { number: 1, name: 'Måndag', audio: 'day_1_mandag' },
    { number: 2, name: 'Tisdag', audio: 'day_2_tisdag' },
    { number: 3, name: 'Onsdag', audio: 'day_3_onsdag' },
    { number: 4, name: 'Torsdag', audio: 'day_4_torsdag' },
    { number: 5, name: 'Fredag', audio: 'day_5_fredag' },
    { number: 6, name: 'Lördag', audio: 'day_6_lordag' },
    { number: 7, name: 'Söndag', audio: 'day_7_sondag' }
];

export class DayMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctMatches = 0;
        this.requiredMatches = 7; // Match all 7 days
        this.currentDays = [];
        this.dropZones = [];
        this.draggableBoxes = [];
        this.currentHoverZone = null;
        this.hasError = false;
        this.isRevealing = false;
        this.heartsDisplay = null;

        // Default config (will be loaded from server)
        this.config = {
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
                if (serverConfig.dayMatch) {
                    this.config.maxErrors = serverConfig.dayMatch.maxErrors || this.config.maxErrors;
                    this.errorsRemaining = this.config.maxErrors;
                    console.log('DayMatchMode loaded config:', this.config);
                }
            }
        } catch (error) {
            console.warn('Failed to load dayMatch config, using defaults:', error);
        }
        this.configLoaded = true;
    }

    generateChallenge() {
        // Use all 7 days
        this.currentDays = [...DAYS_OF_WEEK];

        this.challengeData = {
            days: this.currentDays
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

        // Create number drop zones at top
        const upperY = 220;
        const spacing = 140;
        const startX = width / 2 - (spacing * 3); // Center 7 items

        this.currentDays.forEach((day, index) => {
            const x = startX + index * spacing;

            // Drop zone background with dashed border
            const dropZone = scene.add.rectangle(x, upperY, 120, 120, 0xFFFFFF, 0.2);
            dropZone.setInteractive();
            dropZone.setData('dayNumber', day.number);
            dropZone.setData('matched', false);
            dropZone.setData('originalAlpha', 0.2);
            this.dropZones.push(dropZone);
            this.uiElements.push(dropZone);

            // Create dashed border
            const graphics = scene.add.graphics();
            graphics.lineStyle(3, 0x000000, 1);
            const boxSize = 120;
            const dashLength = 8;
            const gapLength = 6;

            this.drawDashedRect(graphics, x - boxSize / 2, upperY - boxSize / 2, boxSize, boxSize, dashLength, gapLength);

            dropZone.setData('dashedBorder', graphics);
            this.uiElements.push(graphics);

            // Number in drop zone
            const numberText = scene.add.text(x, upperY, day.number.toString(), {
                fontSize: '80px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            });
            numberText.setOrigin(0.5);
            dropZone.setData('numberText', numberText);
            this.uiElements.push(numberText);
        });

        // Create draggable day names at bottom - shuffled
        const lowerY = 520;
        const shuffledDays = [...this.currentDays].sort(() => Math.random() - 0.5);

        shuffledDays.forEach((day, index) => {
            const x = startX + index * spacing;

            // Solid box for draggable day name
            const box = scene.add.rectangle(x, lowerY, 120, 120, 0xFFFFFF, 0.3);
            box.setStrokeStyle(3, 0x4A90E2); // Solid blue border
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('dayNumber', day.number);
            box.setData('dayName', day.name);
            box.setData('dayAudio', day.audio);
            box.setData('startX', x);
            box.setData('startY', lowerY);
            this.draggableBoxes.push(box);
            this.uiElements.push(box);

            // Day name text (NOT interactive - moves with box)
            const dayText = scene.add.text(x, lowerY, day.name, {
                fontSize: '28px',
                fontFamily: 'Arial',
                color: '#4A90E2',
                fontStyle: 'bold',
                align: 'center'
            });
            dayText.setOrigin(0.5);
            // Store reference to text in box
            box.setData('dayText', dayText);

            this.uiElements.push(dayText);

            // Set up drag events on the BOX
            box.on('drag', (pointer, dragX, dragY) => {
                box.x = dragX;
                box.y = dragY;
                dayText.x = dragX;
                dayText.y = dragY;

                // Check hover over drop zones
                this.checkHoverOverZones(scene, pointer);
            });

            box.on('dragend', (pointer) => {
                this.handleDrop(scene, box, pointer);
            });
        });

        // Enable drag and drop on boxes
        scene.input.setDraggable(this.draggableBoxes);
    }

    playDayAudio(scene, audioKey) {
        console.log('🔊 Playing audio:', audioKey);
        if (scene.sound.get(audioKey)) {
            scene.sound.play(audioKey);
        }
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

    checkHoverOverZones(scene, pointer) {
        let foundHover = false;

        this.dropZones.forEach(zone => {
            const bounds = zone.getBounds();
            const isOver = Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);

            if (isOver && !zone.getData('matched')) {
                // Highlight this zone
                zone.setFillStyle(0xFFD700, 0.5); // Gold highlight
                foundHover = true;
                this.currentHoverZone = zone;
            } else if (!zone.getData('matched')) {
                // Reset to original
                zone.setFillStyle(0xFFFFFF, zone.getData('originalAlpha'));
            }
        });

        if (!foundHover && this.currentHoverZone) {
            this.currentHoverZone = null;
        }
    }

    handleDrop(scene, draggedBox, pointer) {
        // Don't allow drops during reveal animation
        if (this.isRevealing) return;

        const dayNumber = draggedBox.getData('dayNumber');
        const dayName = draggedBox.getData('dayName');
        const dayAudio = draggedBox.getData('dayAudio');
        const dayText = draggedBox.getData('dayText');
        let matched = false;
        let droppedOnWrongZone = false;
        let wrongZoneNumber = null;

        // Check if dropped on correct zone OR wrong zone
        this.dropZones.forEach(zone => {
            const zoneNumber = zone.getData('dayNumber');
            const alreadyMatched = zone.getData('matched');
            const bounds = zone.getBounds();

            // Check if day name is over this zone
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                if (!alreadyMatched && zoneNumber === dayNumber) {
                    // Correct match!
                    matched = true;
                    zone.setData('matched', true);

                    // Play the day audio
                    this.playDayAudio(scene, dayAudio);

                    // Snap to zone position
                    draggedBox.x = zone.x;
                    draggedBox.y = zone.y;
                    dayText.x = zone.x;
                    dayText.y = zone.y;

                    dayText.setTint(0x27AE60); // Green tint
                    draggedBox.setStrokeStyle(3, 0x27AE60); // Green border
                    draggedBox.setFillStyle(0x27AE60, 0.2); // Light green fill
                    draggedBox.disableInteractive(); // Can't drag anymore

                    // Reset zone appearance and change to solid green border
                    zone.setFillStyle(0x27AE60, 0.2); // Light green fill
                    const dashedBorder = zone.getData('dashedBorder');
                    if (dashedBorder) {
                        dashedBorder.destroy(); // Remove dashed border
                    }
                    zone.setStrokeStyle(3, 0x27AE60); // Solid green border

                    // Visual feedback animation
                    scene.tweens.add({
                        targets: [draggedBox, dayText],
                        scale: 1.2,
                        duration: 200,
                        yoyo: true,
                        onComplete: () => {
                            // After animation, hide the dragged day name and box
                            draggedBox.setVisible(false);
                            dayText.setVisible(false);

                            // Update the drop zone text to show the day name instead of number
                            const numberText = zone.getData('numberText');
                            if (numberText) {
                                numberText.setText(dayName);
                                numberText.setColor('#27AE60'); // Green color for matched text
                                numberText.setFontSize('28px'); // Smaller font for day name
                            }
                        }
                    });

                    this.correctMatches++;

                    // Check if all matched
                    if (this.correctMatches >= this.requiredMatches) {
                        // Success!
                        scene.time.delayedCall(800, () => {
                            const x = scene.cameras.main.width / 2;
                            const y = scene.cameras.main.height / 2;
                            this.answerCallback(true, 'all-matched', x, y);
                        });
                    }
                } else if (!alreadyMatched) {
                    // Wrong zone! (day number doesn't match)
                    droppedOnWrongZone = true;
                    wrongZoneNumber = zoneNumber;
                }
            }
        });

        // Handle wrong drop or no drop
        if (!matched) {
            if (droppedOnWrongZone) {
                // Track wrong answer
                trackWrongAnswer(
                    'DayMatchMode',
                    dayName, // Correct day name
                    wrongZoneNumber.toString() // Wrong zone number
                );

                // Wrong zone - show error feedback
                this.showWrongDropFeedback(scene, draggedBox, dayText);
            } else {
                // Dropped outside all zones - just return to start
                scene.tweens.add({
                    targets: [draggedBox, dayText],
                    x: draggedBox.getData('startX'),
                    y: draggedBox.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut'
                });
            }

            // Reset any hover effects
            this.dropZones.forEach(zone => {
                if (!zone.getData('matched')) {
                    zone.setFillStyle(0xFFFFFF, zone.getData('originalAlpha'));
                }
            });
        }
    }

    showWrongDropFeedback(scene, draggedBox, dayText) {
        // Lose a heart
        this.errorsRemaining = Math.max(0, this.errorsRemaining - 1);

        // Update hearts display
        const heartsText = '❤️'.repeat(Math.max(0, this.errorsRemaining)) + '🖤'.repeat(this.config.maxErrors - this.errorsRemaining);
        if (this.heartsDisplay) {
            this.heartsDisplay.setText(heartsText);
        }

        // Red flash on the box and text
        dayText.setTint(0xFF0000); // Red tint
        draggedBox.setStrokeStyle(3, 0xFF0000); // Red border
        draggedBox.setFillStyle(0xFF0000, 0.3); // Red fill

        // Shake animation
        const originalX = draggedBox.x;
        scene.tweens.add({
            targets: [draggedBox, dayText],
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                // Clear red tint
                dayText.clearTint();
                draggedBox.setStrokeStyle(3, 0x4A90E2); // Back to blue border
                draggedBox.setFillStyle(0xFFFFFF, 0.3); // Back to white fill

                // Return to start position
                scene.tweens.add({
                    targets: [draggedBox, dayText],
                    x: draggedBox.getData('startX'),
                    y: draggedBox.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        // Check if out of hearts
                        if (this.errorsRemaining <= 0) {
                            // Game over - restart with new challenge
                            scene.time.delayedCall(1000, () => {
                                this.handleGameOver(scene);
                            });
                        }
                    }
                });
            }
        });
    }

    handleGameOver(scene) {
        console.log('💔 Game Over - All hearts lost!');

        // Clean up current UI
        this.cleanup(scene);

        // Reset state for next time
        this.correctMatches = 0;
        this.errorsRemaining = this.config.maxErrors;

        // Reset streak since player lost
        resetStreak();

        // Update booster bar visual immediately
        if (scene.boosterBarElements) {
            updateBoosterBar(scene.boosterBarElements, 0, scene);
        }

        // Generate new challenge
        this.generateChallenge();
        this.createChallengeUI(scene);
    }

    cleanup(scene) {
        // Remove all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.dropZones = [];
        this.draggableBoxes = [];
        this.correctMatches = 0;
        this.currentHoverZone = null;
    }
}
