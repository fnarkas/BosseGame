import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { showNumberProgressPopup } from './numberProgressPopup.js';
import { SpeechRecognitionHelper } from '../utils/speechRecognitionHelper.js';

/**
 * Number Reading Mode - Speech recognition for numbers
 * Shows a number, player clicks microphone button and speaks the number
 * Similar to SpeechRecognitionMode but for numbers instead of words
 */
export class NumberReadingMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;

        // Default values (will be overridden by loadConfig)
        this.requiredCorrect = 1;
        this.availableNumbers = [];
        this.clearedNumbers = new Set(); // Track which numbers have been cleared

        this.currentNumber = null;
        this.displayedNumber = null;
        this.micButton = null;
        this.statusText = null;
        this.ballIndicators = [];
        this.speechHelper = new SpeechRecognitionHelper('sv-SE');
        this.isRevealing = false;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                const config = serverConfig.numberReading || { required: 1, numbers: '10-99' };
                this.requiredCorrect = config.required || 1;
                this.availableNumbers = this.parseNumberRange(config.numbers || '10-99');

                console.log('NumberReadingMode config loaded from server:', {
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
            number: this.currentNumber
        };

        console.log('Generated number reading challenge:', this.currentNumber);
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Display the number at top
        this.displayedNumber = scene.add.text(width / 2, 180, this.currentNumber.toString(), {
            fontSize: '120px',
            fontFamily: 'Arial',
            color: '#000000',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: 6
        }).setOrigin(0.5);
        this.uiElements.push(this.displayedNumber);

        // Create small matrix icon next to the number
        this.createMatrixIcon(scene, 180);

        // Create microphone button and status text
        this.createMicrophoneButton(scene);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Initialize speech recognition using shared helper
        this.initSpeechRecognition(scene);
    }

    createMatrixIcon(scene, numberY) {
        const width = scene.cameras.main.width;

        // Position to the right of the number
        const iconX = width / 2 + 180;
        const iconY = numberY;
        const iconSize = 50;

        // Create a grid icon background
        const iconBg = scene.add.rectangle(iconX, iconY, iconSize, iconSize, 0x3498DB, 0.8);
        iconBg.setStrokeStyle(3, 0xFFFFFF);
        iconBg.setInteractive({ useHandCursor: true });
        iconBg.on('pointerdown', () => {
            this.showMatrixPopup();
        });
        this.uiElements.push(iconBg);

        // Create mini grid pattern (3x3 squares to represent the matrix)
        const miniCellSize = 10;
        const miniGap = 3;
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

    createMicrophoneButton(scene) {
        const width = scene.cameras.main.width;
        const buttonY = 380;

        // Microphone button circle (starts disabled/gray)
        const micBtnSize = 150;
        this.micButton = scene.add.circle(width / 2, buttonY, micBtnSize / 2, 0x95A5A6, 1); // Gray = disabled
        this.micButton.setStrokeStyle(6, 0xFFFFFF);
        this.uiElements.push(this.micButton);

        // Microphone emoji
        const micEmoji = scene.add.text(width / 2, buttonY, '🎤', {
            fontSize: '80px',
            padding: { y: 20 }
        }).setOrigin(0.5);
        this.uiElements.push(micEmoji);

        // Status text (below button)
        this.statusText = scene.add.text(width / 2, buttonY + 120, 'Väntar på mikrofon...', {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#95A5A6'
        }).setOrigin(0.5);
        this.uiElements.push(this.statusText);
    }

    async initSpeechRecognition(scene) {
        // Set up callbacks for the speech helper
        this.speechHelper.onStatusChange = (message, color) => {
            if (this.statusText) {
                this.statusText.setText(message);
                this.statusText.setColor(color);
            }
        };

        this.speechHelper.onResult = (transcript, results) => {
            this.handleSpeechResult(scene, transcript, results);
        };

        this.speechHelper.onError = (error) => {
            if (this.speechHelper.permissionGranted && this.micButton) {
                this.micButton.setFillStyle(0xFF6B6B); // Red when error but permission granted
            }
        };

        this.speechHelper.onStart = () => {
            if (this.micButton) {
                this.micButton.setFillStyle(0x27AE60); // Green = listening
            }
        };

        this.speechHelper.onEnd = () => {
            if (this.micButton && this.speechHelper.permissionGranted) {
                this.micButton.setFillStyle(0xFF6B6B); // Red = ready
            }
        };

        // Initialize the helper
        const success = await this.speechHelper.initialize(scene);

        if (success && this.speechHelper.permissionGranted) {
            // Enable the microphone button
            this.micButton.setFillStyle(0xFF6B6B); // Red = ready
            this.micButton.setInteractive({ useHandCursor: true });

            // Set up click handler
            this.micButton.on('pointerdown', () => {
                if (!this.isRevealing && !this.speechHelper.isListening && this.speechHelper.permissionGranted) {
                    this.speechHelper.startListening(scene);
                }
            });
        }
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = 550;
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

    handleSpeechResult(scene, transcript, results) {
        if (this.isRevealing) return;

        // Try all alternatives to see if any match
        let spokenNumber = null;
        for (let i = 0; i < results.length; i++) {
            const alternative = results[i].transcript.toLowerCase().trim();
            const parsed = this.parseSwedishNumber(alternative);
            if (parsed === this.currentNumber) {
                spokenNumber = parsed;
                break;
            }
        }

        // If no alternative matched, use the first transcript
        if (spokenNumber === null) {
            spokenNumber = this.parseSwedishNumber(transcript);
        }

        console.log(`Expected: ${this.currentNumber}, Spoken: ${spokenNumber} (transcript: "${transcript}")`);

        if (spokenNumber === this.currentNumber) {
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
                    this.answerCallback(true, 'number-reading', x, y);
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
                'NumberReadingMode',
                this.currentNumber.toString(),
                spokenNumber !== null ? spokenNumber.toString() : transcript
            );

            this.showWrongFeedback(scene);
            this.correctInRow = 0;
            this.updateBallIndicators();

            // Reset and try again
            scene.time.delayedCall(2000, () => {
                this.isRevealing = false;
            });
        }
    }

    parseSwedishNumber(text) {
        // Map Swedish number words to digits (0-99)
        const numberMap = {
            'noll': 0, 'ett': 1, 'en': 1, 'två': 2, 'tre': 3, 'fyra': 4,
            'fem': 5, 'sex': 6, 'sju': 7, 'åtta': 8, 'nio': 9,
            'tio': 10, 'elva': 11, 'tolv': 12, 'tretton': 13, 'fjorton': 14,
            'femton': 15, 'sexton': 16, 'sjutton': 17, 'arton': 18, 'nitton': 19,
            'tjugo': 20, 'trettio': 30, 'fyrtio': 40, 'femtio': 50,
            'sextio': 60, 'sjuttio': 70, 'åttio': 80, 'nittio': 90
        };

        // Clean up the text
        text = text.toLowerCase().trim();

        // Direct match
        if (numberMap.hasOwnProperty(text)) {
            return numberMap[text];
        }

        // Check if it's already a digit
        const directNumber = parseInt(text);
        if (!isNaN(directNumber) && directNumber >= 0 && directNumber <= 99) {
            return directNumber;
        }

        // Try to parse compound numbers (e.g., "tjugo tre" = 23, "trettio fem" = 35)
        const words = text.split(/\s+/);
        if (words.length === 2) {
            const tens = numberMap[words[0]];
            const ones = numberMap[words[1]];
            if (tens && tens >= 20 && tens <= 90 && ones && ones >= 1 && ones <= 9) {
                return tens + ones;
            }
        }

        // No match found
        return null;
    }

    showCorrectFeedback(scene) {
        // Green flash on microphone button
        const bg = scene.add.circle(this.micButton.x, this.micButton.y, 80, 0x27AE60, 0.5);
        bg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(bg);

        // Green flash on number
        this.displayedNumber.setColor('#27AE60');

        // Success particles
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, 180);
    }

    showWrongFeedback(scene) {
        this.isRevealing = true;

        // Red flash on microphone button
        const wrongBg = scene.add.circle(this.micButton.x, this.micButton.y, 80, 0xFF0000, 0.5);
        wrongBg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(wrongBg);

        // Red flash on number
        this.displayedNumber.setColor('#FF0000');

        // Shake animation on number
        const originalX = this.displayedNumber.x;
        scene.tweens.add({
            targets: this.displayedNumber,
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.displayedNumber.x = originalX;
                // Reset color
                scene.time.delayedCall(1000, () => {
                    this.displayedNumber.setColor('#000000');
                });
            }
        });
    }

    loadNextChallenge(scene) {
        this.isRevealing = false;

        // Clean up current UI
        this.cleanup(scene);

        // Generate new challenge
        this.generateChallenge();

        // Create new UI
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

        // Clean up
        scene.time.delayedCall(700, () => {
            particles.destroy();
        });
    }

    cleanup(scene) {
        // Clean up speech recognition helper
        if (this.speechHelper) {
            this.speechHelper.cleanup();
        }

        // Clear references
        this.micButton = null;
        this.statusText = null;
        this.ballIndicators = [];
        this.displayedNumber = null;

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
