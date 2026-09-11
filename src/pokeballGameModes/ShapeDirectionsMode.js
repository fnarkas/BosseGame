import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS } from './uiKit.js';

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
        this.shapes = [];

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

        // A direction the child just got wrong is asked again; otherwise pick
        // at random. The reference must not sit at the edge in that direction.
        const direction = this.takeRetry() ?? (Math.random() < 0.5 ? 'hoger' : 'vanster');
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

        // A new question is answerable again
        this.inputLocked = false;
        this.isRevealing = false;

        // Speaker button to replay audio
        this.createSpeakerButton(scene, width / 2, 150, () => this.playQuestionAudio(scene));

        // Progress balls showing how many in a row so far
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: 250 });

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
            const bg = scene.add.rectangle(0, 0, shapeSize, shapeSize, COLORS.NEUTRAL_FILL, 0.3);
            bg.setStrokeStyle(3, COLORS.OUTLINE);
            container.add(bg);

            // Draw the shape
            const shapeGraphic = this.createShape(scene, shapeData.shapeType, shapeData.colorHex);
            container.add(shapeGraphic);

            // Click handler
            container.on('pointerdown', () => {
                // Ignore taps while an answer is being resolved / revealed
                if (this.isInputBlocked()) return;
                this.inputLocked = true;
                this.handleShapeClick(scene, index);
            });

            // Hover effect (must not overwrite the answer feedback colour)
            container.on('pointerover', () => {
                if (!this.isInputBlocked()) bg.setFillStyle(COLORS.HOVER_FILL, 0.5);
            });

            container.on('pointerout', () => {
                if (!this.isInputBlocked()) bg.setFillStyle(COLORS.NEUTRAL_FILL, 0.3);
            });

            this.uiElements.push(container);
        });
    }

    createShape(scene, shapeType, colorHex) {
        const graphics = scene.add.graphics();
        graphics.fillStyle(colorHex, 1);
        graphics.lineStyle(3, COLORS.OUTLINE, 1);

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

    // "Tryck på formen till höger om den" + "blåa cirkeln"
    questionAudioKeys() {
        const { direction, referenceShape } = this.challengeData;
        return [
            `shapedir_prefix_${direction}`,
            `shapedir_${referenceShape.colorId}_${referenceShape.shapeType}`
        ];
    }

    playQuestionAudio(scene) {
        // A replay restarts the sequence, so the combo is never queued twice
        this.playSequence(scene, this.questionAudioKeys());
    }

    containerAt(index) {
        return this.uiElements.find(el => el.getData && el.getData('index') === index);
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
        this.updateProgressBalls(this.correctInRow);

        // Highlight correct shape in green
        const container = this.containerAt(clickedIndex);
        if (container) {
            container.list[0].setFillStyle(COLORS.CORRECT, 0.7);
        }

        // Check if won
        if (this.correctInRow >= this.requiredCorrect) {
            this.delayedCall(scene, 500, () => {
                const x = scene.cameras.main.width / 2;
                const y = scene.cameras.main.height / 2;
                this.finish(true, 'shape-directions', x, y);
            });
        } else {
            // Continue to next challenge
            this.delayedCall(scene, 800, () => {
                this.cleanup(scene);
                this.generateChallenge();
                this.createChallengeUI(scene);
            });
        }
    }

    handleWrongAnswer(scene, clickedIndex) {
        this.correctInRow = 0;
        this.updateProgressBalls(0);

        // Red shake on the wrong shape (the container has no fill, so paint
        // its background ourselves)
        const wrongContainer = this.containerAt(clickedIndex);
        if (wrongContainer) {
            wrongContainer.list[0].setFillStyle(COLORS.WRONG, 0.7);
        }
        this.shakeWrong(scene, wrongContainer, {
            restore: false,
            onComplete: () => this.revealTarget(scene)
        });
    }

    revealTarget(scene) {
        const { direction, targetIndex } = this.challengeData;
        const correctContainer = this.containerAt(targetIndex);
        if (correctContainer) {
            correctContainer.list[0].setFillStyle(COLORS.REVEAL, 0.7);
        }

        // Ask the same direction again next time
        this.queueRetry(direction);

        // Gold pulse on the right shape while the question is repeated, so
        // the child hears "till höger om den blåa cirkeln" while looking at
        // the answer. 400 ms shake + 2100 ms reveal = 2.5 s, then the streak
        // is reset and a new challenge starts.
        this.revealAnswer(scene, {
            targets: correctContainer ? [correctContainer] : [],
            audioKeys: this.questionAudioKeys(),
            delay: 2100
        });
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.shapes = [];
    }
}
