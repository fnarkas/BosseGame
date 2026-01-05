import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { SWEDISH_LETTERS } from '../letterData.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

export class LetterDragMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctMatches = 0;
        this.requiredMatches = 4; // Match all 4 letters
        this.currentLetters = [];
        this.dropZones = [];
        this.draggableLetters = [];
        this.draggableBoxes = []; // Store boxes for draggable letters
        this.currentHoverZone = null; // Track which zone is being hovered
        this.hasError = false; // Track if player made an error
        this.isRevealing = false; // Track if we're showing the answer
    }

    generateChallenge() {
        // Pick 4 random Swedish letters
        const shuffled = [...SWEDISH_LETTERS].sort(() => Math.random() - 0.5);
        this.currentLetters = shuffled.slice(0, 4);

        this.challengeData = {
            letters: this.currentLetters
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Create uppercase letters (drop zones) at top
        const upperY = 250;
        const spacing = 200;
        const startX = width / 2 - (spacing * 1.5);

        this.currentLetters.forEach((letter, index) => {
            const x = startX + index * spacing;

            // Drop zone background with dashed border
            const dropZone = scene.add.rectangle(x, upperY, 150, 150, 0xFFFFFF, 0.2);
            dropZone.setInteractive();
            dropZone.setData('letter', letter);
            dropZone.setData('matched', false);
            dropZone.setData('originalAlpha', 0.2);
            this.dropZones.push(dropZone);
            this.uiElements.push(dropZone);

            // Create dashed border using graphics
            const graphics = scene.add.graphics();
            graphics.lineStyle(4, 0x000000, 1);
            const boxSize = 150;
            const dashLength = 10;
            const gapLength = 8;

            // Draw dashed rectangle
            this.drawDashedRect(graphics, x - boxSize / 2, upperY - boxSize / 2, boxSize, boxSize, dashLength, gapLength);

            dropZone.setData('dashedBorder', graphics);
            this.uiElements.push(graphics);

            // Uppercase letter in drop zone
            const upperText = scene.add.text(x, upperY, letter.toUpperCase(), {
                fontSize: '96px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            });
            upperText.setOrigin(0.5);
            upperText.setData('initialText', letter.toUpperCase());
            dropZone.setData('upperText', upperText);
            this.uiElements.push(upperText);
        });

        // Create lowercase letters (draggable) at bottom - shuffled
        const lowerY = 550;
        const shuffledLetters = [...this.currentLetters].sort(() => Math.random() - 0.5);

        shuffledLetters.forEach((letter, index) => {
            const x = startX + index * spacing;

            // Solid box for draggable letter
            const box = scene.add.rectangle(x, lowerY, 150, 150, 0xFFFFFF, 0.3);
            box.setStrokeStyle(4, 0x4A90E2); // Solid blue border
            this.draggableBoxes.push(box);
            this.uiElements.push(box);

            // Draggable lowercase letter
            const lowerText = scene.add.text(x, lowerY, letter.toLowerCase(), {
                fontSize: '96px',
                fontFamily: 'Arial',
                color: '#4A90E2',
                fontStyle: 'bold'
            });
            lowerText.setOrigin(0.5);
            lowerText.setInteractive({ useHandCursor: true, draggable: true });
            lowerText.setData('letter', letter);
            lowerText.setData('startX', x);
            lowerText.setData('startY', lowerY);
            lowerText.setData('box', box); // Store reference to box

            this.draggableLetters.push(lowerText);
            this.uiElements.push(lowerText);

            // Set up drag events
            lowerText.on('drag', (pointer, dragX, dragY) => {
                lowerText.x = dragX;
                lowerText.y = dragY;
                box.x = dragX;
                box.y = dragY;

                // Check hover over drop zones
                this.checkHoverOverZones(scene, pointer);
            });

            lowerText.on('dragend', (pointer) => {
                this.handleDrop(scene, lowerText, pointer);
            });
        });

        // Enable drag and drop
        scene.input.setDraggable(this.draggableLetters);
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

    handleDrop(scene, draggedLetter, pointer) {
        // Don't allow drops during reveal animation
        if (this.isRevealing) return;

        const letter = draggedLetter.getData('letter');
        const box = draggedLetter.getData('box');
        let matched = false;
        let droppedOnWrongZone = false;
        let wrongZoneLetter = null;

        // Check if dropped on correct zone OR wrong zone
        this.dropZones.forEach(zone => {
            const zoneLetter = zone.getData('letter');
            const alreadyMatched = zone.getData('matched');
            const bounds = zone.getBounds();

            // Check if letter is over this zone
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                if (!alreadyMatched && zoneLetter === letter) {
                    // Correct match!
                    matched = true;
                    zone.setData('matched', true);

                    // Snap to zone position
                    draggedLetter.x = zone.x;
                    draggedLetter.y = zone.y;
                    box.x = zone.x;
                    box.y = zone.y;

                    draggedLetter.setTint(0x27AE60); // Green tint
                    box.setStrokeStyle(4, 0x27AE60); // Green border
                    box.setFillStyle(0x27AE60, 0.2); // Light green fill
                    draggedLetter.disableInteractive(); // Can't drag anymore

                    // Reset zone appearance and change to solid green border
                    zone.setFillStyle(0x27AE60, 0.2); // Light green fill
                    const dashedBorder = zone.getData('dashedBorder');
                    if (dashedBorder) {
                        dashedBorder.destroy(); // Remove dashed border
                    }
                    zone.setStrokeStyle(4, 0x27AE60); // Solid green border

                    // Visual feedback animation
                    scene.tweens.add({
                        targets: [draggedLetter, box],
                        scale: 1.2,
                        duration: 200,
                        yoyo: true,
                        onComplete: () => {
                            // After animation, hide the dragged letter and box
                            draggedLetter.setVisible(false);
                            box.setVisible(false);

                            // Update the drop zone text to show both uppercase and lowercase
                            const upperText = zone.getData('upperText');
                            if (upperText) {
                                const upperLetter = letter.toUpperCase();
                                const lowerLetter = letter.toLowerCase();
                                upperText.setText(`${upperLetter}${lowerLetter}`);
                                upperText.setColor('#27AE60'); // Green color for matched text
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
                    // Wrong zone! (letter doesn't match)
                    droppedOnWrongZone = true;
                    wrongZoneLetter = zoneLetter.toLowerCase();
                }
            }
        });

        // Handle wrong drop or no drop
        if (!matched) {
            if (droppedOnWrongZone) {
                // Track wrong answer - player confused letter with wrongZoneLetter
                trackWrongAnswer(
                    'LetterDragMatchMode',
                    letter, // Correct letter (lowercase)
                    wrongZoneLetter // Wrong zone letter (lowercase)
                );

                // Wrong zone - show error feedback
                this.showWrongDropFeedback(scene, draggedLetter, box);
            } else {
                // Dropped outside all zones - just return to start
                scene.tweens.add({
                    targets: [draggedLetter, box],
                    x: draggedLetter.getData('startX'),
                    y: draggedLetter.getData('startY'),
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

    showWrongDropFeedback(scene, draggedLetter, box) {
        // Red flash on the box and letter
        draggedLetter.setTint(0xFF0000); // Red tint
        box.setStrokeStyle(4, 0xFF0000); // Red border
        box.setFillStyle(0xFF0000, 0.3); // Red fill

        // Shake animation
        const originalX = draggedLetter.x;
        scene.tweens.add({
            targets: [draggedLetter, box],
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                // Clear red tint
                draggedLetter.clearTint();
                box.setStrokeStyle(4, 0x4A90E2); // Back to blue border
                box.setFillStyle(0xFFFFFF, 0.3); // Back to white fill

                // Return to start position
                scene.tweens.add({
                    targets: [draggedLetter, box],
                    x: draggedLetter.getData('startX'),
                    y: draggedLetter.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        // ONE ERROR = GAME OVER
                        // Highlight the correct zone for this letter
                        this.hasError = true;
                        const letter = draggedLetter.getData('letter');
                        this.highlightCorrectZone(scene, letter);
                    }
                });
            }
        });
    }

    highlightCorrectZone(scene, letter) {
        this.isRevealing = true;

        // Disable all dragging
        this.draggableLetters.forEach(l => {
            l.disableInteractive();
        });

        // Find the correct drop zone for this letter
        const correctZone = this.dropZones.find(zone => zone.getData('letter') === letter);
        if (!correctZone) return;

        // Change to gold/attention-grabbing color
        correctZone.setFillStyle(0xFFD700, 0.5); // Gold fill

        // Replace dashed border with solid pulsing border
        const dashedBorder = correctZone.getData('dashedBorder');
        if (dashedBorder) {
            dashedBorder.destroy();
        }
        correctZone.setStrokeStyle(6, 0xFFD700); // Thick gold border

        // Pulsing scale animation
        scene.tweens.add({
            targets: correctZone,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 500,
            yoyo: true,
            repeat: 3, // Pulse 4 times total (2 seconds)
            ease: 'Sine.easeInOut'
        });

        // Pulsing alpha on fill
        scene.tweens.add({
            targets: correctZone,
            alpha: 0.7,
            duration: 500,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut'
        });

        // After 2 seconds of pulsing, restart with new letters
        scene.time.delayedCall(2000, () => {
            // Clean up current UI
            this.cleanup(scene);

            // Reset state
            this.hasError = false;
            this.isRevealing = false;
            this.correctMatches = 0;

            // Generate new challenge with different letters
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
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
        this.draggableLetters = [];
        this.draggableBoxes = [];
        this.correctMatches = 0;
        this.currentHoverZone = null;
        // Note: Don't reset hasError or isRevealing here - they're managed by revealCorrectAnswers
    }
}
