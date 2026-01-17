import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { showNumberProgressPopup } from './numberProgressPopup.js';

export class NumberListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;

        // Default values (will be overridden by loadConfig)
        this.requiredCorrect = 1;
        this.availableNumbers = [];
        this.clearedNumbers = new Set(); // Track which numbers have been cleared

        this.currentNumber = null;
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = []; // 0-9 draggable boxes
        this.ballIndicators = [];
        this.currentAudio = null;
        this.isRevealing = false;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                const config = serverConfig.numbers || { required: 1, numbers: '10-99' };
                this.requiredCorrect = config.required || 1;
                this.availableNumbers = this.parseNumberRange(config.numbers || '10-99');

                console.log('NumberListeningMode config loaded from server:', {
                    required: this.requiredCorrect,
                    numbersConfig: config.numbers,
                    availableNumbers: this.availableNumbers,
                    count: this.availableNumbers.length
                });
            } else {
                throw new Error('Config not found');
            }
        } catch (error) {
            console.warn('Failed to load server config, using defaults:', error);
            this.requiredCorrect = 1;
            this.availableNumbers = this.parseNumberRange('10-99');
        }

        this.configLoaded = true;
    }

    parseNumberRange(input) {
        try {
            const parts = input.split(',');
            const numbers = new Set();

            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
                    if (isNaN(start) || isNaN(end) || start > end || start < 0) {
                        continue; // Skip invalid
                    }
                    for (let i = start; i <= end; i++) {
                        numbers.add(i);
                    }
                } else {
                    const num = parseInt(trimmed);
                    if (isNaN(num) || num < 0) {
                        continue; // Skip invalid
                    }
                    numbers.add(num);
                }
            }

            const result = Array.from(numbers).sort((a, b) => a - b);
            return result.length > 0 ? result : [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // Fallback
        } catch (error) {
            return [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // Fallback
        }
    }

    generateChallenge() {
        // Generate random number from configured available numbers
        const randomIndex = Math.floor(Math.random() * this.availableNumbers.length);
        this.currentNumber = this.availableNumbers[randomIndex];

        this.challengeData = {
            number: this.currentNumber,
            tens: Math.floor(this.currentNumber / 10),
            ones: this.currentNumber % 10
        };

        console.log('Generated number challenge:', {
            number: this.currentNumber,
            randomIndex: randomIndex,
            availableCount: this.availableNumbers.length
        });
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Speaker button to replay audio (centered at top)
        const speakerBtn = scene.add.text(width / 2, 180, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            this.playNumberAudio(scene);
        });
        this.uiElements.push(speakerBtn);

        // Play number audio automatically when challenge loads
        this.playNumberAudio(scene);

        // Create two drop zones for tens and ones (side by side)
        const dropZoneY = 320;
        const dropZoneSize = 120;
        const dropZoneSpacing = 20;

        // Tens place (left)
        this.tensZone = scene.add.rectangle(
            width / 2 - dropZoneSize / 2 - dropZoneSpacing / 2,
            dropZoneY,
            dropZoneSize,
            dropZoneSize,
            0xFFFFFF,
            0.2
        );
        this.tensZone.setStrokeStyle(4, 0x000000, 1);
        this.tensZone.setInteractive();
        this.tensZone.setData('value', null);
        this.tensZone.setData('place', 'tens');
        this.uiElements.push(this.tensZone);

        // Tens label
        const tensLabel = scene.add.text(
            this.tensZone.x,
            this.tensZone.y,
            '',
            {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }
        );
        tensLabel.setOrigin(0.5);
        this.tensZone.setData('label', tensLabel);
        this.uiElements.push(tensLabel);

        // Ones place (right)
        this.onesZone = scene.add.rectangle(
            width / 2 + dropZoneSize / 2 + dropZoneSpacing / 2,
            dropZoneY,
            dropZoneSize,
            dropZoneSize,
            0xFFFFFF,
            0.2
        );
        this.onesZone.setStrokeStyle(4, 0x000000, 1);
        this.onesZone.setInteractive();
        this.onesZone.setData('value', null);
        this.onesZone.setData('place', 'ones');
        this.uiElements.push(this.onesZone);

        // Ones label
        const onesLabel = scene.add.text(
            this.onesZone.x,
            this.onesZone.y,
            '',
            {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }
        );
        onesLabel.setOrigin(0.5);
        this.onesZone.setData('label', onesLabel);
        this.uiElements.push(onesLabel);

        // Create small matrix icon next to drop zones
        this.createMatrixIcon(scene, dropZoneY);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Create digit boxes (0-9) at bottom in 2 rows of 5
        this.createDigitBoxes(scene);
    }

    createMatrixIcon(scene, dropZoneY) {
        const width = scene.cameras.main.width;

        // Position to the right of the drop zones
        const iconX = width / 2 + 180;
        const iconY = dropZoneY;
        const iconSize = 60;

        // Create a grid icon background
        const iconBg = scene.add.rectangle(iconX, iconY, iconSize, iconSize, 0x3498DB, 0.8);
        iconBg.setStrokeStyle(3, 0xFFFFFF);
        iconBg.setInteractive({ useHandCursor: true });
        iconBg.on('pointerdown', () => {
            this.showMatrixPopup();
        });
        this.uiElements.push(iconBg);

        // Create mini grid pattern (3x3 squares to represent the matrix)
        const miniCellSize = 12;
        const miniGap = 4;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const x = iconX - miniCellSize - miniGap + col * (miniCellSize + miniGap);
                const y = iconY - miniCellSize - miniGap + row * (miniCellSize + miniGap);
                const miniCell = scene.add.rectangle(x, y, miniCellSize, miniCellSize, 0xFFFFFF, 0.9);
                miniCell.setInteractive({ useHandCursor: true });
                miniCell.on('pointerdown', () => {
                    this.showMatrixPopup();
                });
                this.uiElements.push(miniCell);
            }
        }
    }

    showMatrixPopup() {
        // Always show 0-99 regardless of configured numbers
        showNumberProgressPopup(
            this.clearedNumbers,
            0,
            99,
            'Progress: Numbers 0-99'
        );
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = 470;
        const spacing = 60;

        this.ballIndicators = [];

        for (let i = 0; i < this.requiredCorrect; i++) {
            const x = startX + i * spacing;

            // Create circle indicator
            const circle = scene.add.circle(x, y, 20,
                i < this.correctInRow ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);

            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Add gift emoji at the end to show the goal
        const giftX = startX + this.requiredCorrect * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '48px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        // Update ball colors based on correctInRow
        for (let i = 0; i < this.ballIndicators.length; i++) {
            if (i < this.correctInRow) {
                this.ballIndicators[i].setFillStyle(0x27AE60); // Green
            } else {
                this.ballIndicators[i].setFillStyle(0xffffff); // White
            }
        }
    }

    createDigitBoxes(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 80;
        const spacing = 20;
        const cols = 5;
        const startY = 580;
        const rowSpacing = 20;

        // Calculate starting X to center the grid
        const gridWidth = cols * boxSize + (cols - 1) * spacing;
        const startX = (width - gridWidth) / 2 + boxSize / 2;

        for (let digit = 0; digit <= 9; digit++) {
            const row = Math.floor(digit / cols);
            const col = digit % cols;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + rowSpacing);

            // Create draggable box for digit
            const box = scene.add.rectangle(x, y, boxSize, boxSize, 0x4A90E2, 0.3);
            box.setStrokeStyle(3, 0x4A90E2);
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('digit', digit);
            box.setData('startX', x);
            box.setData('startY', y);
            this.digitBoxes.push(box);
            this.uiElements.push(box);

            // Digit text
            const digitText = scene.add.text(x, y, digit.toString(), {
                fontSize: '56px',
                fontFamily: 'Arial',
                color: '#ffffff',
                fontStyle: 'bold'
            });
            digitText.setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            // Drag events
            box.on('drag', (pointer, dragX, dragY) => {
                box.x = dragX;
                box.y = dragY;
                digitText.x = dragX;
                digitText.y = dragY;

                // Highlight drop zones when hovering
                this.checkHoverOverZones(scene, pointer);
            });

            box.on('dragend', (pointer) => {
                this.handleDrop(scene, box, pointer);
            });
        }

        scene.input.setDraggable(this.digitBoxes);
    }

    checkHoverOverZones(scene, pointer) {
        [this.tensZone, this.onesZone].forEach(zone => {
            const bounds = zone.getBounds();
            const isOver = Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);

            if (isOver) {
                zone.setFillStyle(0xFFD700, 0.5); // Gold highlight
            } else {
                zone.setFillStyle(0xFFFFFF, 0.2); // White
            }
        });
    }

    handleDrop(scene, draggedBox, pointer) {
        if (this.isRevealing) return;

        const digit = draggedBox.getData('digit');
        const digitText = draggedBox.getData('text');
        let dropped = false;

        // Check if dropped on tens or ones zone
        [this.tensZone, this.onesZone].forEach(zone => {
            const bounds = zone.getBounds();
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                // Update zone value and label
                zone.setData('value', digit);
                const label = zone.getData('label');
                label.setText(digit.toString());
                dropped = true;

                // Reset zone color
                zone.setFillStyle(0xFFFFFF, 0.2);
            }
        });

        // Return box to start position (numbers are reusable)
        scene.tweens.add({
            targets: [draggedBox, digitText],
            x: draggedBox.getData('startX'),
            y: draggedBox.getData('startY'),
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Check if both zones are filled
        if (this.tensZone.getData('value') !== null && this.onesZone.getData('value') !== null) {
            this.checkAnswer(scene);
        }
    }

    checkAnswer(scene) {
        const tensValue = this.tensZone.getData('value');
        const onesValue = this.onesZone.getData('value');
        const playerNumber = tensValue * 10 + onesValue;

        if (playerNumber === this.currentNumber) {
            // Correct!
            this.showCorrectFeedback(scene);
            this.correctInRow++;

            // Add to cleared numbers
            this.clearedNumbers.add(this.currentNumber);

            this.updateBallIndicators();

            // Check if won
            if (this.correctInRow >= this.requiredCorrect) {
                scene.time.delayedCall(1000, () => {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.answerCallback(true, 'number-match', x, y);
                });
            } else {
                // Load next number
                scene.time.delayedCall(1000, () => {
                    this.loadNextChallenge(scene);
                });
            }
        } else {
            // Wrong!
            trackWrongAnswer(
                'NumberListeningMode',
                this.currentNumber.toString(),
                playerNumber.toString()
            );

            this.showWrongFeedback(scene);
            this.correctInRow = 0;
            this.updateBallIndicators();

            // Reset and try again
            scene.time.delayedCall(2000, () => {
                this.clearZones();
                this.isRevealing = false;
            });
        }
    }

    showCorrectFeedback(scene) {
        // Green flash on zones
        this.tensZone.setFillStyle(0x27AE60, 0.5);
        this.onesZone.setFillStyle(0x27AE60, 0.5);

        // Success particles
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, 320);
    }

    showWrongFeedback(scene) {
        this.isRevealing = true;

        // Red flash on zones
        this.tensZone.setFillStyle(0xFF0000, 0.5);
        this.onesZone.setFillStyle(0xFF0000, 0.5);

        // Shake animation
        const originalTensX = this.tensZone.x;
        const originalOnesX = this.onesZone.x;

        scene.tweens.add({
            targets: [this.tensZone, this.tensZone.getData('label')],
            x: originalTensX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3
        });

        scene.tweens.add({
            targets: [this.onesZone, this.onesZone.getData('label')],
            x: originalOnesX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                // Show correct answer
                this.showCorrectAnswer(scene);
            }
        });
    }

    showCorrectAnswer(scene) {
        // Clear current values
        this.clearZones();

        // Show correct answer in gold
        this.tensZone.setData('value', this.challengeData.tens);
        this.tensZone.getData('label').setText(this.challengeData.tens.toString());
        this.tensZone.getData('label').setColor('#FFD700');

        this.onesZone.setData('value', this.challengeData.ones);
        this.onesZone.getData('label').setText(this.challengeData.ones.toString());
        this.onesZone.getData('label').setColor('#FFD700');

        this.tensZone.setFillStyle(0xFFD700, 0.5);
        this.onesZone.setFillStyle(0xFFD700, 0.5);

        // Pulse animation
        scene.tweens.add({
            targets: [this.tensZone, this.onesZone, this.tensZone.getData('label'), this.onesZone.getData('label')],
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 500,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut'
        });
    }

    clearZones() {
        // Reset zones
        this.tensZone.setData('value', null);
        this.tensZone.getData('label').setText('');
        this.tensZone.getData('label').setColor('#000000');
        this.tensZone.setFillStyle(0xFFFFFF, 0.2);

        this.onesZone.setData('value', null);
        this.onesZone.getData('label').setText('');
        this.onesZone.getData('label').setColor('#000000');
        this.onesZone.setFillStyle(0xFFFFFF, 0.2);
    }

    loadNextChallenge(scene) {
        this.clearZones();
        this.isRevealing = false;

        // Generate new challenge
        this.generateChallenge();

        // Play new audio
        this.playNumberAudio(scene);
    }

    showSuccessParticles(scene, x, y) {
        // Create star-shaped particle texture if it doesn't exist
        if (!scene.textures.exists('star')) {
            const particleGraphics = scene.add.graphics();
            particleGraphics.fillStyle(0xFFFF00, 1);
            particleGraphics.lineStyle(2, 0xFFD700);

            const outerRadius = 12;
            const innerRadius = 5;
            const points = 5;

            particleGraphics.beginPath();
            for (let i = 0; i < points * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / points;
                const px = 12 + radius * Math.sin(angle);
                const py = 12 - radius * Math.cos(angle);
                if (i === 0) {
                    particleGraphics.moveTo(px, py);
                } else {
                    particleGraphics.lineTo(px, py);
                }
            }
            particleGraphics.closePath();
            particleGraphics.fillPath();
            particleGraphics.strokePath();

            particleGraphics.generateTexture('star', 24, 24);
            particleGraphics.destroy();
        }

        // Create particles
        const particles = scene.add.particles(x, y, 'star', {
            speed: { min: 100, max: 200 },
            angle: { min: 0, max: 360 },
            scale: { start: 2, end: 0 },
            lifespan: 600,
            gravityY: 150,
            tint: [0xFFFF00, 0xFFD700, 0xFFA500],
            quantity: 15
        });
        particles.setDepth(100);
        particles.explode();

        // Clean up
        scene.time.delayedCall(700, () => {
            particles.destroy();
        });
    }

    playNumberAudio(scene) {
        const audioKey = `number_audio_${this.currentNumber}`;

        // Stop and destroy any currently playing audio
        if (this.currentAudio) {
            if (this.currentAudio.isPlaying) {
                this.currentAudio.stop();
            }
            this.currentAudio.destroy();
            this.currentAudio = null;
        }

        // Play the audio (Phaser will handle if it doesn't exist)
        try {
            this.currentAudio = scene.sound.add(audioKey);
            this.currentAudio.play();
        } catch (error) {
            console.warn(`Audio not found for number: ${this.currentNumber} (key: ${audioKey})`);
        }
    }

    cleanup(scene) {
        // Stop and destroy any playing audio
        if (this.currentAudio) {
            if (this.currentAudio.isPlaying) {
                this.currentAudio.stop();
            }
            this.currentAudio.destroy();
            this.currentAudio = null;
        }

        // Clear references
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];
        this.ballIndicators = [];

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
