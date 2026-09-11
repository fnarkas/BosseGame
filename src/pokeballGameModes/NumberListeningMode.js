import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';
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
        this.lastNumber = null; // Avoid asking the same number twice in a row
        this.thousandsZone = null;
        this.hundredsZone = null;
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = []; // 0-9 draggable boxes
        this.ballIndicators = [];
        this.currentAudio = null;
        this.numberAudio = null; // Pre-created audio for numbers 0-99
        this.hundredsAudio = null; // Pre-created audio for hundreds (100, 200, 300)
        this.remainderAudio = null; // Pre-created audio for remainder (0-99)
        this.remainderTimer = null; // Timer that starts the remainder after the hundreds
        this.revealTween = null; // Gold pulse shown while revealing the answer
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
            const parts = String(input).split(',');
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
        // Guard against generateChallenge() before loadConfig()
        if (!this.availableNumbers || this.availableNumbers.length === 0) {
            this.availableNumbers = this.parseNumberRange('10-99');
        }

        // Generate random number from configured available numbers, never the
        // same one twice in a row when there is a choice
        let pool = this.availableNumbers;
        if (pool.length > 1 && this.lastNumber !== null) {
            pool = pool.filter(n => n !== this.lastNumber);
        }
        const randomIndex = Math.floor(Math.random() * pool.length);
        this.currentNumber = pool[randomIndex];
        this.lastNumber = this.currentNumber;

        this.challengeData = {
            number: this.currentNumber,
            thousands: Math.floor(this.currentNumber / 1000),
            hundreds: Math.floor((this.currentNumber % 1000) / 100),
            tens: Math.floor((this.currentNumber % 100) / 10),
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

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // Speaker button to replay audio (centered at top)
        const speakerBtn = scene.add.text(width / 2, 180, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            this.playNumberAudio(scene);
        });
        this.uiElements.push(speakerBtn);

        // Pre-create audio instances for instant playback (eliminates pause in stitching)
        this.createAudio(scene);

        // Play number audio automatically when challenge loads
        this.playNumberAudio(scene);

        // Create drop zones (2, 3, or 4 depending on number size)
        const dropZoneY = 320;
        const dropZoneSize = 120;
        const dropZoneSpacing = 20;
        const needsThousands = this.currentNumber >= 1000;
        const needsHundreds = this.currentNumber >= 100;
        const numZones = needsThousands ? 4 : (needsHundreds ? 3 : 2);

        // Calculate positions to center the zones
        const totalWidth = numZones * dropZoneSize + (numZones - 1) * dropZoneSpacing;
        const startX = (width - totalWidth) / 2 + dropZoneSize / 2;

        let currentZoneX = startX;

        if (needsThousands) {
            // Thousands place (leftmost)
            this.thousandsZone = scene.add.rectangle(
                currentZoneX,
                dropZoneY,
                dropZoneSize,
                dropZoneSize,
                0xFFFFFF,
                0.2
            );
            this.thousandsZone.setStrokeStyle(4, 0x000000, 1);
            this.thousandsZone.setInteractive();
            this.thousandsZone.setData('value', null);
            this.thousandsZone.setData('place', 'thousands');
            this.uiElements.push(this.thousandsZone);

            // Thousands label
            const thousandsLabel = scene.add.text(
                this.thousandsZone.x,
                this.thousandsZone.y,
                '',
                {
                    fontSize: '72px',
                    fontFamily: 'Arial',
                    color: '#000000',
                    fontStyle: 'bold'
                }
            );
            thousandsLabel.setOrigin(0.5);
            this.thousandsZone.setData('label', thousandsLabel);
            this.uiElements.push(thousandsLabel);

            currentZoneX += dropZoneSize + dropZoneSpacing;
        }

        if (needsHundreds) {
            // Hundreds place (second from left if thousands, else leftmost)
            this.hundredsZone = scene.add.rectangle(
                currentZoneX,
                dropZoneY,
                dropZoneSize,
                dropZoneSize,
                0xFFFFFF,
                0.2
            );
            this.hundredsZone.setStrokeStyle(4, 0x000000, 1);
            this.hundredsZone.setInteractive();
            this.hundredsZone.setData('value', null);
            this.hundredsZone.setData('place', 'hundreds');
            this.uiElements.push(this.hundredsZone);

            // Hundreds label
            const hundredsLabel = scene.add.text(
                this.hundredsZone.x,
                this.hundredsZone.y,
                '',
                {
                    fontSize: '72px',
                    fontFamily: 'Arial',
                    color: '#000000',
                    fontStyle: 'bold'
                }
            );
            hundredsLabel.setOrigin(0.5);
            this.hundredsZone.setData('label', hundredsLabel);
            this.uiElements.push(hundredsLabel);

            currentZoneX += dropZoneSize + dropZoneSpacing;
        }

        // Tens place
        this.tensZone = scene.add.rectangle(
            currentZoneX,
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

        currentZoneX += dropZoneSize + dropZoneSpacing;

        // Ones place (rightmost)
        this.onesZone = scene.add.rectangle(
            currentZoneX,
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

    /**
     * Pre-create the sound instances for the current number so replays are
     * instant and nothing leaks (they are destroyed in cleanup()).
     * 0-99 have their own files; 100-1000 are stitched from hundreds + remainder.
     */
    createAudio(scene) {
        this.destroyAudio();

        try {
            if (this.currentNumber >= 100 && this.currentNumber <= 1000) {
                const hundreds = Math.floor(this.currentNumber / 100) * 100;
                const remainder = this.currentNumber % 100;

                this.hundredsAudio = scene.sound.add(`number_audio_${hundreds}`);
                if (remainder > 0) {
                    this.remainderAudio = scene.sound.add(`number_audio_${remainder}`);
                }
            } else if (this.currentNumber >= 0 && this.currentNumber <= 99) {
                this.numberAudio = scene.sound.add(`number_audio_${this.currentNumber}`);
            } else {
                console.warn(`No audio available for number: ${this.currentNumber}`);
            }
        } catch (error) {
            console.warn(`Audio not found for number: ${this.currentNumber}`, error);
        }
    }

    createMatrixIcon(scene, dropZoneY) {
        const width = scene.cameras.main.width;

        // Position to the right of the drop zones (adjust for 3 zones if needed)
        const needsHundreds = this.currentNumber >= 100;
        const iconX = needsHundreds ? width / 2 + 260 : width / 2 + 180;
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

    getZones() {
        const zones = [];
        if (this.thousandsZone) zones.push(this.thousandsZone);
        if (this.hundredsZone) zones.push(this.hundredsZone);
        if (this.tensZone) zones.push(this.tensZone);
        if (this.onesZone) zones.push(this.onesZone);
        return zones;
    }

    checkHoverOverZones(scene, pointer) {
        // No highlight while the answer is being resolved/revealed
        if (this.isRevealing || this.inputLocked) return;

        this.getZones().forEach(zone => {
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
        const digit = draggedBox.getData('digit');
        const digitText = draggedBox.getData('text');

        // Return box to start position (numbers are reusable)
        this.addTween(scene, {
            targets: [draggedBox, digitText],
            x: draggedBox.getData('startX'),
            y: draggedBox.getData('startY'),
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Drops are ignored while an answer is being resolved or revealed
        if (this.isRevealing || this.inputLocked) return;

        // Check if dropped on any zone
        this.getZones().forEach(zone => {
            const bounds = zone.getBounds();
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                // Update zone value and label
                zone.setData('value', digit);
                const label = zone.getData('label');
                label.setText(digit.toString());

                // Reset zone color
                zone.setFillStyle(0xFFFFFF, 0.2);
            }
        });

        // Check if all required zones are filled
        const allFilled = this.getZones().every(zone => zone.getData('value') !== null);

        if (allFilled) {
            this.inputLocked = true;
            this.checkAnswer(scene);
        }
    }

    checkAnswer(scene) {
        const thousandsValue = this.thousandsZone ? this.thousandsZone.getData('value') : 0;
        const hundredsValue = this.hundredsZone ? this.hundredsZone.getData('value') : 0;
        const tensValue = this.tensZone.getData('value');
        const onesValue = this.onesZone.getData('value');
        const playerNumber = thousandsValue * 1000 + hundredsValue * 100 + tensValue * 10 + onesValue;

        if (playerNumber === this.currentNumber) {
            // Correct!
            this.showCorrectFeedback(scene);
            this.correctInRow++;

            // Add to cleared numbers
            this.clearedNumbers.add(this.currentNumber);

            this.updateBallIndicators();

            // Check if won
            if (this.correctInRow >= this.requiredCorrect) {
                this.delayedCall(scene, 1000, () => {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.finish(true, 'number-match', x, y);
                });
            } else {
                // Load next number
                this.delayedCall(scene, 1000, () => {
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

            // Reset streak since player made an error
            resetStreak();
            if (scene.boosterBarElements) {
                updateBoosterBar(scene.boosterBarElements, 0, scene);
            }

            // Reset and try again
            this.delayedCall(scene, 2000, () => {
                this.stopRevealTween();
                this.clearZones();
                this.isRevealing = false;
                this.inputLocked = false;
            });
        }
    }

    showCorrectFeedback(scene) {
        // Green flash on zones
        this.getZones().forEach(zone => zone.setFillStyle(0x27AE60, 0.5));

        // Success particles
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, 320);
    }

    showWrongFeedback(scene) {
        this.isRevealing = true;

        // Red flash on zones
        this.getZones().forEach(zone => zone.setFillStyle(0xFF0000, 0.5));

        // Shake animation
        const zones = this.getZones();
        zones.forEach((zone, index) => {
            const originalX = zone.x;
            const isLast = index === zones.length - 1;
            this.addTween(scene, {
                targets: [zone, zone.getData('label')],
                x: originalX - 10,
                duration: 50,
                yoyo: true,
                repeat: 3,
                onComplete: isLast ? () => {
                    // Show correct answer
                    this.showCorrectAnswer(scene);
                } : undefined
            });
        });
    }

    showCorrectAnswer(scene) {
        // Clear current values
        this.clearZones();

        const targets = [];
        const reveal = (zone, value) => {
            zone.setData('value', value);
            zone.getData('label').setText(value.toString());
            zone.getData('label').setColor('#FFD700');
            zone.setFillStyle(0xFFD700, 0.5);
            targets.push(zone, zone.getData('label'));
        };

        // Show correct answer in gold
        if (this.thousandsZone) reveal(this.thousandsZone, this.challengeData.thousands);
        if (this.hundredsZone) reveal(this.hundredsZone, this.challengeData.hundreds);
        reveal(this.tensZone, this.challengeData.tens);
        reveal(this.onesZone, this.challengeData.ones);

        // Pulse animation
        this.revealTween = this.addTween(scene, {
            targets: targets,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 500,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.revealTween = null;
            }
        });
    }

    stopRevealTween() {
        if (this.revealTween) {
            const targets = this.revealTween.targets || [];
            this.revealTween.stop();
            this.revealTween = null;
            targets.forEach(target => {
                if (target && target.setScale) target.setScale(1);
            });
        }
    }

    clearZones() {
        // Reset zones
        this.getZones().forEach(zone => {
            zone.setData('value', null);
            zone.getData('label').setText('');
            zone.getData('label').setColor('#000000');
            zone.setFillStyle(0xFFFFFF, 0.2);
        });
    }

    loadNextChallenge(scene) {
        // Clean up current UI
        this.cleanup(scene);

        // Generate new challenge
        this.generateChallenge();

        // Recreate UI for new challenge (may have different number of zones)
        this.createChallengeUI(scene);
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
        // Tracked so cleanup() can remove it if the mode is torn down mid-burst
        this.uiElements.push(particles);

        // Clean up
        this.delayedCall(scene, 700, () => {
            particles.destroy();
        });
    }

    playNumberAudio(scene) {
        // Stop any currently playing audio (and a pending remainder)
        if (this.remainderTimer) {
            this.remainderTimer.remove(false);
            this.pendingTimers.delete(this.remainderTimer);
            this.remainderTimer = null;
        }
        [this.numberAudio, this.hundredsAudio, this.remainderAudio].forEach(audio => {
            if (audio && audio.isPlaying) audio.stop();
        });

        // For numbers >= 100, use pre-created audio instances
        // e.g., 245 = play "200" + "45", 645 = play "600" + "45"
        if (this.hundredsAudio) {
            this.currentAudio = this.hundredsAudio;
            this.hundredsAudio.play();

            // If there's a remainder, start it when hundreds finishes (no overlap)
            if (this.remainderAudio) {
                const gapMs = 50; // 50ms gap between audio parts for natural pause
                const hundredsDuration = this.hundredsAudio.duration * 1000; // Convert to ms
                const delayMs = hundredsDuration + gapMs;

                this.remainderTimer = this.delayedCall(scene, delayMs, () => {
                    this.remainderTimer = null;
                    if (!this.remainderAudio) return;
                    this.currentAudio = this.remainderAudio;
                    this.remainderAudio.play();
                });
            }
        } else if (this.numberAudio) {
            // For numbers < 100, play directly
            this.currentAudio = this.numberAudio;
            this.numberAudio.play();
        } else {
            console.warn(`Audio not found for number: ${this.currentNumber}`);
        }
    }

    destroyAudio() {
        [this.numberAudio, this.hundredsAudio, this.remainderAudio].forEach(audio => {
            if (!audio) return;
            if (audio.isPlaying) audio.stop();
            audio.destroy();
        });
        this.numberAudio = null;
        this.hundredsAudio = null;
        this.remainderAudio = null;
        this.currentAudio = null;
        this.remainderTimer = null;
    }

    cleanup(scene) {
        // Cancels pending timers/tweens, destroys uiElements, unlocks input
        super.cleanup(scene);

        // Stop and destroy audio instances
        this.destroyAudio();

        // Clear references
        this.revealTween = null;
        this.isRevealing = false;
        this.thousandsZone = null;
        this.hundredsZone = null;
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];
        this.ballIndicators = [];
    }
}
