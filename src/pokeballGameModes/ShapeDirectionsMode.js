import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';

/**
 * Shape Directions game mode
 * Advanced directions game where players must find a reference shape
 * and click the shape to its left or right
 *
 * Question format: "Tryck på formen till [höger/vänster] om den [color] [shape]"
 * Example: "Tryck på formen till höger om den blåa cirkeln"
 */
export class ShapeDirectionsMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;
        this.requiredCorrect = 3;
        this.ballIndicators = [];
        this.shapes = [];
        this.currentAudio = null;
        this.isRevealing = false;

        // Shape and color definitions
        this.shapeTypes = [
            { id: 'circle', swedish: 'cirkeln', color: 'blåa' },
            { id: 'square', swedish: 'fyrkanten', color: 'röda' },
            { id: 'triangle', swedish: 'triangeln', color: 'gula' },
            { id: 'star', swedish: 'stjärnan', color: 'gröna' }
        ];

        this.colors = [
            { id: 'blue', swedish: 'blåa', hex: 0x3498DB },
            { id: 'red', swedish: 'röda', hex: 0xE74C3C },
            { id: 'yellow', swedish: 'gula', hex: 0xF39C12 },
            { id: 'green', swedish: 'gröna', hex: 0x27AE60 },
            { id: 'orange', swedish: 'orange', hex: 0xFF8C00 },
            { id: 'purple', swedish: 'lila', hex: 0x9B59B6 }
        ];
    }

    generateChallenge() {
        // Generate 6-8 unique shapes
        const numShapes = Phaser.Math.Between(6, 8);
        const availableShapes = [];

        // Create all possible combinations
        for (const shape of this.shapeTypes) {
            for (const color of this.colors) {
                availableShapes.push({
                    shapeType: shape.id,
                    shapeSwedish: shape.swedish,
                    colorId: color.id,
                    colorSwedish: color.swedish,
                    colorHex: color.hex
                });
            }
        }

        // Shuffle and pick unique shapes
        Phaser.Utils.Array.Shuffle(availableShapes);
        this.shapes = availableShapes.slice(0, numShapes);

        // Pick a reference shape (not at edges in the requested direction)
        const direction = Math.random() < 0.5 ? 'hoger' : 'vanster';
        let referenceIndex;

        if (direction === 'hoger') {
            // Reference must not be the rightmost shape
            referenceIndex = Phaser.Math.Between(0, numShapes - 2);
        } else {
            // Reference must not be the leftmost shape
            referenceIndex = Phaser.Math.Between(1, numShapes - 1);
        }

        const referenceShape = this.shapes[referenceIndex];
        const targetIndex = direction === 'hoger' ? referenceIndex + 1 : referenceIndex - 1;

        this.challengeData = {
            shapes: this.shapes,
            direction: direction,
            directionSwedish: direction === 'hoger' ? 'höger' : 'vänster',
            referenceIndex: referenceIndex,
            referenceShape: referenceShape,
            targetIndex: targetIndex,
            targetShape: this.shapes[targetIndex]
        };

        console.log('ShapeDirections challenge:', {
            direction: this.challengeData.directionSwedish,
            reference: `${referenceShape.colorSwedish} ${referenceShape.shapeSwedish}`,
            targetIndex: targetIndex
        });
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Pre-create audio instances for instant playback
        const { direction, referenceShape } = this.challengeData;
        const prefixKey = `shapedir_prefix_${direction}`;
        const comboKey = `shapedir_${referenceShape.colorId}_${referenceShape.shapeType}`;

        this.prefixAudio = scene.sound.add(prefixKey);
        this.comboAudio = scene.sound.add(comboKey);

        // Speaker button to replay audio
        const speakerBtn = scene.add.text(width / 2, 150, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            this.playQuestionAudio(scene);
        });
        this.uiElements.push(speakerBtn);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Draw shapes in a row
        this.drawShapes(scene);

        // Play question audio
        this.playQuestionAudio(scene);
    }

    drawShapes(scene) {
        const width = scene.cameras.main.width;
        const numShapes = this.shapes.length;
        const shapeSize = 80;
        const spacing = 20;
        const totalWidth = numShapes * shapeSize + (numShapes - 1) * spacing;
        const startX = (width - totalWidth) / 2 + shapeSize / 2;
        const y = 350;

        this.shapes.forEach((shapeData, index) => {
            const x = startX + index * (shapeSize + spacing);

            // Create interactive container for each shape
            const container = scene.add.container(x, y);
            container.setSize(shapeSize, shapeSize);
            container.setInteractive({ useHandCursor: true });
            container.setData('index', index);

            // Background
            const bg = scene.add.rectangle(0, 0, shapeSize, shapeSize, 0xFFFFFF, 0.3);
            bg.setStrokeStyle(3, 0x000000);
            container.add(bg);

            // Draw the shape
            const shapeGraphic = this.createShape(scene, shapeData.shapeType, shapeData.colorHex);
            container.add(shapeGraphic);

            // Click handler
            container.on('pointerdown', () => {
                if (!this.isRevealing) {
                    this.handleShapeClick(scene, index);
                }
            });

            // Hover effect
            container.on('pointerover', () => {
                bg.setFillStyle(0xECF0F1, 0.5);
            });

            container.on('pointerout', () => {
                bg.setFillStyle(0xFFFFFF, 0.3);
            });

            this.uiElements.push(container);
        });
    }

    createShape(scene, shapeType, colorHex) {
        const graphics = scene.add.graphics();
        graphics.fillStyle(colorHex, 1);
        graphics.lineStyle(3, 0x000000, 1);

        switch (shapeType) {
            case 'circle':
                graphics.fillCircle(0, 0, 30);
                graphics.strokeCircle(0, 0, 30);
                break;

            case 'square':
                graphics.fillRect(-30, -30, 60, 60);
                graphics.strokeRect(-30, -30, 60, 60);
                break;

            case 'triangle':
                graphics.beginPath();
                graphics.moveTo(0, -35);
                graphics.lineTo(35, 30);
                graphics.lineTo(-35, 30);
                graphics.closePath();
                graphics.fillPath();
                graphics.strokePath();
                break;

            case 'star':
                this.drawStar(graphics, 0, 0, 5, 35, 15);
                break;
        }

        return graphics;
    }

    drawStar(graphics, x, y, points, outerRadius, innerRadius) {
        graphics.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            if (i === 0) {
                graphics.moveTo(px, py);
            } else {
                graphics.lineTo(px, py);
            }
        }
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = 250;
        const spacing = 60;

        this.ballIndicators = [];

        for (let i = 0; i < this.requiredCorrect; i++) {
            const x = startX + i * spacing;

            const circle = scene.add.circle(x, y, 20,
                i < this.correctInRow ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);

            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Gift emoji
        const giftX = startX + this.requiredCorrect * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '48px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        for (let i = 0; i < this.ballIndicators.length; i++) {
            if (i < this.correctInRow) {
                this.ballIndicators[i].setFillStyle(0x27AE60);
            } else {
                this.ballIndicators[i].setFillStyle(0xffffff);
            }
        }
    }

    async playQuestionAudio(scene) {
        // Stop any currently playing audio
        if (this.currentAudio) {
            this.currentAudio.stop();
        }

        // Use pre-created audio instances for instant playback with zero delay
        this.currentAudio = this.prefixAudio;
        this.prefixAudio.play();

        // When prefix finishes, immediately play the color-shape combo
        this.prefixAudio.once('complete', () => {
            this.currentAudio = this.comboAudio;
            this.comboAudio.play();
        });
    }

    handleShapeClick(scene, clickedIndex) {
        const isCorrect = clickedIndex === this.challengeData.targetIndex;

        if (isCorrect) {
            this.handleCorrectAnswer(scene, clickedIndex);
        } else {
            this.handleWrongAnswer(scene, clickedIndex);
        }
    }

    handleCorrectAnswer(scene, clickedIndex) {
        this.correctInRow++;
        this.updateBallIndicators();

        // Highlight correct shape in green
        const container = this.uiElements.find(el => el.getData && el.getData('index') === clickedIndex);
        if (container) {
            const bg = container.list[0];
            bg.setFillStyle(0x27AE60, 0.7);
        }

        // Check if won
        if (this.correctInRow >= this.requiredCorrect) {
            scene.time.delayedCall(500, () => {
                if (this.answerCallback) {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.answerCallback(true, 'shape-directions', x, y);
                }
            });
        } else {
            // Continue to next challenge
            scene.time.delayedCall(800, () => {
                this.cleanup(scene);
                this.generateChallenge();
                this.createChallengeUI(scene);
            });
        }
    }

    handleWrongAnswer(scene, clickedIndex) {
        this.isRevealing = true;
        this.correctInRow = 0;
        this.updateBallIndicators();

        // Highlight wrong shape in red
        const wrongContainer = this.uiElements.find(el => el.getData && el.getData('index') === clickedIndex);
        if (wrongContainer) {
            const bg = wrongContainer.list[0];
            bg.setFillStyle(0xFF0000, 0.7);

            // Shake animation
            scene.tweens.add({
                targets: wrongContainer,
                x: wrongContainer.x - 10,
                duration: 50,
                yoyo: true,
                repeat: 3
            });
        }

        // Highlight correct shape in gold
        const correctContainer = this.uiElements.find(el => el.getData && el.getData('index') === this.challengeData.targetIndex);
        if (correctContainer) {
            scene.time.delayedCall(400, () => {
                const bg = correctContainer.list[0];
                bg.setFillStyle(0xFFD700, 0.7);

                // Pulse animation
                scene.tweens.add({
                    targets: correctContainer,
                    scaleX: 1.2,
                    scaleY: 1.2,
                    duration: 500,
                    yoyo: true,
                    repeat: 2,
                    ease: 'Sine.easeInOut'
                });
            });
        }

        // Restart with new challenge after 2 seconds
        scene.time.delayedCall(2500, () => {
            this.isRevealing = false;
            this.cleanup(scene);
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
    }

    cleanup(scene) {
        // Stop any playing audio
        if (this.currentAudio) {
            if (this.currentAudio.isPlaying) {
                this.currentAudio.stop();
            }
            this.currentAudio.destroy();
            this.currentAudio = null;
        }

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.ballIndicators = [];
        this.shapes = [];
        this.isRevealing = false;
    }
}
