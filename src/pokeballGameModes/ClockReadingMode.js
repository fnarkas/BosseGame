import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';
import { SpeechRecognitionHelper } from '../utils/speechRecognitionHelper.js';

/**
 * Clock Reading Mode - Speech recognition for Swedish time
 * Shows a clock with hands, player clicks microphone and speaks the time
 * Similar to NumberReadingMode but for clock times
 */
export class ClockReadingMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctCount = 0;

        // Default values (will be overridden by loadConfig)
        this.requiredCorrect = 3;
        this.includeHalfHours = true;

        this.currentHour = null;
        this.currentMinute = null;
        this.clockGraphics = null;
        this.hourHand = null;
        this.minuteHand = null;
        this.clockCenter = { x: 0, y: 0 };
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
                const config = serverConfig.clockReading || { required: 3, includeHalfHours: true };
                this.requiredCorrect = config.required || 3;
                this.includeHalfHours = config.includeHalfHours !== false;

                console.log('ClockReadingMode config loaded from server:', {
                    required: this.requiredCorrect,
                    includeHalfHours: this.includeHalfHours
                });
            } else {
                throw new Error('Config not found');
            }
        } catch (error) {
            console.warn('Failed to load server config, using defaults:', error);
            this.requiredCorrect = 3;
            this.includeHalfHours = true;
        }

        this.configLoaded = true;
    }

    generateChallenge() {
        const previousHour = this.currentHour;
        const previousMinute = this.currentMinute;

        // Generate random time (whole hours or half hours), avoiding the same
        // time twice in a row.
        for (let attempt = 0; attempt < 20; attempt++) {
            this.currentHour = Math.floor(Math.random() * 12) + 1; // 1-12

            if (this.includeHalfHours && Math.random() < 0.5) {
                this.currentMinute = 30; // Half hour
            } else {
                this.currentMinute = 0; // Whole hour
            }

            if (this.currentHour !== previousHour || this.currentMinute !== previousMinute) break;
        }

        this.challengeData = {
            hour: this.currentHour,
            minute: this.currentMinute
        };

        console.log('Generated clock reading challenge:', `${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`);
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // A new question is answerable again
        this.inputLocked = false;
        this.isRevealing = false;

        // Create clock at top center
        this.clockCenter = { x: width / 2, y: 240 };
        this.createClock(scene);

        // Create microphone button and status text
        this.createMicrophoneButton(scene);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Initialize speech recognition using shared helper
        this.initSpeechRecognition(scene);
    }

    createClock(scene) {
        const clockRadius = 120;
        const { x, y } = this.clockCenter;

        // Clock face background
        const clockBg = scene.add.circle(x, y, clockRadius, 0xFFFFFF, 1);
        clockBg.setStrokeStyle(6, 0x000000);
        this.uiElements.push(clockBg);

        // Hour markers (only 12, 3, 6, 9 for simplicity)
        const mainHours = [12, 3, 6, 9];
        for (const hour of mainHours) {
            const angle = (hour * 30 - 90) * Math.PI / 180; // Convert to radians, -90 to start at 12
            const markerRadius = clockRadius - 20;
            const markerX = x + Math.cos(angle) * markerRadius;
            const markerY = y + Math.sin(angle) * markerRadius;

            const marker = scene.add.text(markerX, markerY, hour.toString(), {
                fontSize: '28px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.uiElements.push(marker);
        }

        // Minute marks (small dots)
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const dotRadius = clockRadius - 10;
            const dotX = x + Math.cos(angle) * dotRadius;
            const dotY = y + Math.sin(angle) * dotRadius;

            const dot = scene.add.circle(dotX, dotY, 3, 0x000000, 1);
            this.uiElements.push(dot);
        }

        // Create hour hand (shorter, thicker)
        const hourHandLength = 50;
        this.hourHand = scene.add.rectangle(x, y, 8, hourHandLength, 0x2C3E50, 1);
        this.hourHand.setOrigin(0.5, 1); // Pivot at bottom (center of clock)
        this.uiElements.push(this.hourHand);

        // Create minute hand (longer, thinner)
        const minuteHandLength = 85;
        this.minuteHand = scene.add.rectangle(x, y, 5, minuteHandLength, 0xE74C3C, 1);
        this.minuteHand.setOrigin(0.5, 1); // Pivot at bottom (center of clock)
        this.uiElements.push(this.minuteHand);

        // Center dot (on top of hands)
        const centerDot = scene.add.circle(x, y, 8, 0x000000, 1);
        this.uiElements.push(centerDot);

        // Set hand positions based on current time
        this.updateClockHands();
    }

    updateClockHands() {
        // Hour hand: 0° = 12, 30° = 1, 60° = 2, etc.
        // Add minute offset so hour hand moves gradually (e.g., at 6:30 it's between 6 and 7)
        const hourAngle = ((this.currentHour % 12) * 30) + (this.currentMinute / 60 * 30);

        // Minute hand: 0° = 0, 180° = 30, etc.
        const minuteAngle = (this.currentMinute / 5) * 30;

        this.hourHand.angle = hourAngle;
        this.minuteHand.angle = minuteAngle;
    }

    createMicrophoneButton(scene) {
        const width = scene.cameras.main.width;
        const buttonY = 460;

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
        const micButton = this.micButton;
        const success = await this.speechHelper.initialize(scene);

        // The UI may have been torn down (or rebuilt for the next challenge)
        // while we were waiting; don't touch a stale button.
        if (!this.micButton || this.micButton !== micButton) return;

        if (success && this.speechHelper.permissionGranted) {
            // Enable the microphone button
            this.micButton.setFillStyle(0xFF6B6B); // Red = ready
            this.micButton.setInteractive({ useHandCursor: true });

            // Set up click handler
            this.micButton.on('pointerdown', () => {
                if (this.isRevealing || this.inputLocked) return;
                if (!this.speechHelper.isListening) {
                    this.speechHelper.startListening(scene);
                }
            });
        }
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = 640;
        const spacing = 60;

        this.ballIndicators = [];

        for (let i = 0; i < this.requiredCorrect; i++) {
            const x = startX + i * spacing;

            // Create circle indicator
            const circle = scene.add.circle(x, y, 20,
                i < this.correctCount ? 0x27AE60 : 0xffffff, 1);
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
        // Update ball colors based on correctCount
        for (let i = 0; i < this.ballIndicators.length; i++) {
            if (i < this.correctCount) {
                this.ballIndicators[i].setFillStyle(0x27AE60); // Green
            } else {
                this.ballIndicators[i].setFillStyle(0xffffff); // White
            }
        }
    }

    handleSpeechResult(scene, transcript, results) {
        // Ignore results while an answer is being resolved / revealed
        if (this.isRevealing || this.inputLocked) return;
        this.inputLocked = true;

        // Try all alternatives to see if any match
        let spokenTime = null;
        for (let i = 0; i < results.length; i++) {
            const alternative = results[i].transcript.toLowerCase().trim();
            const parsed = this.parseSwedishTime(alternative);
            if (parsed && parsed.hour === this.currentHour && parsed.minute === this.currentMinute) {
                spokenTime = parsed;
                break;
            }
        }

        // If no alternative matched, use the first transcript
        if (spokenTime === null) {
            spokenTime = this.parseSwedishTime(transcript);
        }

        console.log(`Expected: ${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}, Spoken:`, spokenTime, `(transcript: "${transcript}")`);

        const isCorrect = spokenTime && spokenTime.hour === this.currentHour && spokenTime.minute === this.currentMinute;

        if (isCorrect) {
            // Correct!
            this.showCorrectFeedback(scene);
            this.correctCount++;
            this.updateBallIndicators();

            // Check if won
            if (this.correctCount >= this.requiredCorrect) {
                this.delayedCall(scene, 1000, () => {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.finish(true, 'clock-reading', x, y);
                });
            } else {
                // Load next challenge
                this.delayedCall(scene, 1000, () => {
                    this.loadNextChallenge(scene);
                });
            }
        } else {
            // Wrong!
            const spokenStr = spokenTime ? `${spokenTime.hour}:${spokenTime.minute.toString().padStart(2, '0')}` : transcript;
            trackWrongAnswer(
                'ClockReadingMode',
                `${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`,
                spokenStr
            );

            this.showWrongFeedback(scene);

            // Reset streak since player made an error
            resetStreak();
            if (scene.boosterBarElements) {
                updateBoosterBar(scene.boosterBarElements, 0, scene);
            }

            // Keep the accumulated progress (the X correct don't have to be in a
            // row) and move on to a new clock so a miss doesn't block progress.
            this.delayedCall(scene, 2000, () => {
                this.loadNextChallenge(scene);
            });
        }
    }

    parseSwedishTime(text) {
        // Parse Swedish time expressions
        // "klockan ett" = 1:00
        // "klockan halv två" = 1:30
        // "klockan tolv" = 12:00
        // "klockan halv ett" = 12:30

        text = text.toLowerCase().trim();

        // Remove "klockan" / "klockan är" prefix if present
        text = text.replace(/^klockan\s+(är\s+)?/, '');

        // Digits: "3", "3:00", "03.00", "3:30", "halv 3" (the recogniser often
        // returns numerals instead of number words)
        const digitMatch = text.match(/^(?:halv\s+)?(\d{1,2})(?:[:.]\s?(\d{2}))?$/);
        if (digitMatch) {
            const isHalv = text.startsWith('halv');
            const num = parseInt(digitMatch[1], 10);
            const mins = digitMatch[2] !== undefined ? parseInt(digitMatch[2], 10) : 0;
            if (num >= 1 && num <= 12) {
                if (isHalv && mins === 0) {
                    return { hour: num === 1 ? 12 : num - 1, minute: 30 };
                }
                if (!isHalv && (mins === 0 || mins === 30)) {
                    return { hour: num, minute: mins };
                }
            }
            return null;
        }

        // Hour names mapping
        const hourNames = {
            'ett': 1, 'en': 1,
            'två': 2,
            'tre': 3,
            'fyra': 4,
            'fem': 5,
            'sex': 6,
            'sju': 7,
            'åtta': 8,
            'nio': 9,
            'tio': 10,
            'elva': 11,
            'tolv': 12
        };

        // Check for half hours: "halv X" means 30 minutes before hour X
        // e.g., "halv två" = 1:30, "halv tre" = 2:30
        // (\w does not match å/ä/ö, so "halv två" needs an explicit class)
        const halfMatch = text.match(/^halv\s+([a-zåäö]+)$/);
        if (halfMatch) {
            const nextHourName = halfMatch[1];
            const nextHour = hourNames[nextHourName];
            if (nextHour) {
                const hour = nextHour === 1 ? 12 : nextHour - 1;
                return { hour, minute: 30 };
            }
        }

        // Check for whole hours
        for (const [name, hour] of Object.entries(hourNames)) {
            if (text === name) {
                return { hour, minute: 0 };
            }
        }

        // No match
        return null;
    }

    showCorrectFeedback(scene) {
        // Green flash on microphone button
        const bg = scene.add.circle(this.micButton.x, this.micButton.y, 80, 0x27AE60, 0.5);
        bg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(bg);

        // Green flash on clock
        const clockFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 130, 0x27AE60, 0.3);
        this.uiElements.push(clockFlash);

        // Success particles
        this.showSuccessParticles(scene, this.clockCenter.x, this.clockCenter.y);
    }

    showWrongFeedback(scene) {
        this.isRevealing = true;

        // Red flash on microphone button
        const wrongBg = scene.add.circle(this.micButton.x, this.micButton.y, 80, 0xFF0000, 0.5);
        wrongBg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(wrongBg);

        // Red flash on clock
        const clockFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 130, 0xFF0000, 0.3);
        this.uiElements.push(clockFlash);

        // Shake animation on clock
        const originalX = this.clockCenter.x;
        const clockElements = this.uiElements.filter(el =>
            el.x === originalX && el.y === this.clockCenter.y
        );

        this.addTween(scene, {
            targets: clockElements,
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                clockElements.forEach(el => el.x = originalX);
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
        this.uiElements.push(particles);

        // Clean up
        this.delayedCall(scene, 700, () => {
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
        this.hourHand = null;
        this.minuteHand = null;
        this.clockGraphics = null;
        this.ballIndicators = [];
        this.isRevealing = false;

        // Destroy all UI elements, cancel pending timers/tweens, unlock input
        super.cleanup(scene);
    }
}
