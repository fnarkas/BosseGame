import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

/**
 * Clock Listening Mode - Listen to Swedish time and set clock hands
 * User hears "Klockan tre" or "Klockan halv fem" and must set the clock correctly
 */
export class ClockListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;

        // Default values (will be overridden by loadConfig)
        this.requiredCorrect = 3;
        this.includeHalfHours = true;

        this.currentHour = null;
        this.currentMinute = null;
        this.clockGraphics = null;
        this.hourHand = null;
        this.minuteHand = null;
        this.hourHitbox = null;
        this.minuteHitbox = null;
        this.clockCenter = { x: 0, y: 0 };
        this.currentAudio = null;
        this.ballIndicators = [];
        this.isDragging = false;
        this.draggedHand = null;
        this.isRevealing = false;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                const config = serverConfig.clockListening || { required: 3, includeHalfHours: true };
                this.requiredCorrect = config.required || 3;
                this.includeHalfHours = config.includeHalfHours !== false;

                console.log('ClockListeningMode config loaded from server:', {
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
        // Generate random time (whole hours or half hours)
        this.currentHour = Math.floor(Math.random() * 12) + 1; // 1-12

        if (this.includeHalfHours && Math.random() < 0.5) {
            this.currentMinute = 30; // Half hour
        } else {
            this.currentMinute = 0; // Whole hour
        }

        this.challengeData = {
            hour: this.currentHour,
            minute: this.currentMinute
        };

        console.log('Generated clock challenge:', `${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`);
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Speaker button to replay audio (centered at top)
        const speakerBtn = scene.add.text(width / 2, 150, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            this.playClockAudio(scene);
        });
        this.uiElements.push(speakerBtn);

        // Play clock audio automatically when challenge loads
        this.playClockAudio(scene);

        // Create clock at center
        this.clockCenter = { x: width / 2, y: 360 };
        this.createClock(scene);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Submit button
        this.createSubmitButton(scene);
    }

    createClock(scene) {
        const clockRadius = 140;
        const { x, y } = this.clockCenter;

        // Clock face background
        const clockBg = scene.add.circle(x, y, clockRadius, 0xFFFFFF, 1);
        clockBg.setStrokeStyle(6, 0x000000);
        this.uiElements.push(clockBg);

        // Hour markers
        for (let i = 1; i <= 12; i++) {
            const angle = (i * 30 - 90) * Math.PI / 180; // Convert to radians, -90 to start at 12
            const markerRadius = clockRadius - 20;
            const markerX = x + Math.cos(angle) * markerRadius;
            const markerY = y + Math.sin(angle) * markerRadius;

            const marker = scene.add.text(markerX, markerY, i.toString(), {
                fontSize: '24px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.uiElements.push(marker);
        }

        // Create hour hand (shorter, thicker)
        const hourHandLength = 60;
        this.hourHand = scene.add.rectangle(x, y, 8, hourHandLength, 0x2C3E50, 1);
        this.hourHand.setOrigin(0.5, 1); // Pivot at bottom (center of clock)
        this.hourHand.setData('handType', 'hour');
        this.hourHand.setData('initialAngle', 0);
        this.uiElements.push(this.hourHand);

        // Create minute hand (longer, thinner)
        const minuteHandLength = 100;
        this.minuteHand = scene.add.rectangle(x, y, 5, minuteHandLength, 0xE74C3C, 1);
        this.minuteHand.setOrigin(0.5, 1); // Pivot at bottom (center of clock)
        this.minuteHand.setData('handType', 'minute');
        this.minuteHand.setData('initialAngle', 0);
        this.uiElements.push(this.minuteHand);

        // Create larger invisible hitboxes for easier dragging
        this.hourHitbox = scene.add.rectangle(x, y, 40, hourHandLength + 20, 0xFFFFFF, 0);
        this.hourHitbox.setOrigin(0.5, 1);
        this.hourHitbox.setInteractive({ useHandCursor: true, draggable: true });
        this.hourHitbox.setData('handType', 'hour');
        this.hourHitbox.setData('targetHand', this.hourHand);
        this.uiElements.push(this.hourHitbox);

        this.minuteHitbox = scene.add.rectangle(x, y, 30, minuteHandLength + 20, 0xFFFFFF, 0);
        this.minuteHitbox.setOrigin(0.5, 1);
        this.minuteHitbox.setInteractive({ useHandCursor: true, draggable: true });
        this.minuteHitbox.setData('handType', 'minute');
        this.minuteHitbox.setData('targetHand', this.minuteHand);
        this.uiElements.push(this.minuteHitbox);

        // Center dot (on top of hands)
        const centerDot = scene.add.circle(x, y, 8, 0x000000, 1);
        this.uiElements.push(centerDot);

        // Set initial hand positions to 12:00
        this.hourHand.angle = 0;
        this.minuteHand.angle = 0;
        this.hourHitbox.angle = 0;
        this.minuteHitbox.angle = 0;

        // Set up drag events for hitboxes
        this.setupHandDragging(scene, this.hourHitbox);
        this.setupHandDragging(scene, this.minuteHitbox);
    }

    setupHandDragging(scene, hitbox) {
        const targetHand = hitbox.getData('targetHand');

        hitbox.on('dragstart', () => {
            this.isDragging = true;
            this.draggedHand = hitbox;
            hitbox.setData('initialAngle', hitbox.angle);
        });

        hitbox.on('drag', (pointer) => {
            if (this.isRevealing) return;

            // Calculate angle from clock center to pointer
            const dx = pointer.x - this.clockCenter.x;
            const dy = pointer.y - this.clockCenter.y;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            angle += 90; // Adjust so 0 degrees is at top (12 o'clock)

            // Snap to nearest appropriate increment
            if (hitbox.getData('handType') === 'hour') {
                // Snap to 30-degree increments (each hour)
                angle = Math.round(angle / 30) * 30;
            } else {
                // Snap to 6-degree increments (each 5 minutes)
                angle = Math.round(angle / 6) * 6;
            }

            // Update both hitbox and visible hand
            hitbox.angle = angle;
            if (targetHand) {
                targetHand.angle = angle;
            }
        });

        hitbox.on('dragend', () => {
            this.isDragging = false;
            this.draggedHand = null;
        });
    }

    createSubmitButton(scene) {
        const width = scene.cameras.main.width;
        const buttonY = 580;

        // Submit button
        const submitBtn = scene.add.rectangle(width / 2, buttonY, 200, 70, 0x27AE60, 1);
        submitBtn.setStrokeStyle(4, 0xFFFFFF);
        submitBtn.setInteractive({ useHandCursor: true });
        this.uiElements.push(submitBtn);

        const submitText = scene.add.text(width / 2, buttonY, '✓', {
            fontSize: '48px',
            fontFamily: 'Arial',
            color: '#FFFFFF'
        }).setOrigin(0.5);
        this.uiElements.push(submitText);

        submitBtn.on('pointerdown', () => {
            if (!this.isRevealing) {
                this.checkAnswer(scene);
            }
        });
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = 680;
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

    checkAnswer(scene) {
        // Get current hand positions
        const hourAngle = ((this.hourHand.angle % 360) + 360) % 360; // Normalize to 0-360
        const minuteAngle = ((this.minuteHand.angle % 360) + 360) % 360;

        // Convert angles to hours and minutes
        // Hour hand: 0° = 12, 30° = 1, 60° = 2, etc.
        let playerHour = Math.round(hourAngle / 30);
        if (playerHour === 0) playerHour = 12;

        // Minute hand: 0° = 0, 6° = 5, 180° = 30, etc.
        const playerMinute = Math.round(minuteAngle / 6) * 5; // Snap to 5-minute increments

        console.log(`Player: ${playerHour}:${playerMinute.toString().padStart(2, '0')}, Correct: ${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`);

        // Check if correct (allow some tolerance)
        const isCorrect = (playerHour === this.currentHour && playerMinute === this.currentMinute);

        if (isCorrect) {
            // Correct!
            this.showCorrectFeedback(scene);
            this.correctInRow++;
            this.updateBallIndicators();

            // Check if won
            if (this.correctInRow >= this.requiredCorrect) {
                scene.time.delayedCall(1000, () => {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.answerCallback(true, 'clock-listening', x, y);
                });
            } else {
                // Load next challenge
                scene.time.delayedCall(1000, () => {
                    this.loadNextChallenge(scene);
                });
            }
        } else {
            // Wrong!
            trackWrongAnswer(
                'ClockListeningMode',
                `${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`,
                `${playerHour}:${playerMinute.toString().padStart(2, '0')}`
            );

            this.showWrongFeedback(scene);
            this.correctInRow = 0;
            this.updateBallIndicators();

            // Reset and try again
            scene.time.delayedCall(2000, () => {
                this.resetHands();
                this.isRevealing = false;
            });
        }
    }

    showCorrectFeedback(scene) {
        // Green flash on clock
        const greenFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 150, 0x27AE60, 0.3);
        this.uiElements.push(greenFlash);

        // Success particles
        this.showSuccessParticles(scene, this.clockCenter.x, this.clockCenter.y);
    }

    showWrongFeedback(scene) {
        this.isRevealing = true;

        // Red flash on clock
        const redFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 150, 0xFF0000, 0.3);
        this.uiElements.push(redFlash);

        // Shake animation
        const originalX = this.clockCenter.x;
        scene.tweens.add({
            targets: this.uiElements.filter(el =>
                el.x === originalX && el.y === this.clockCenter.y
            ),
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.showCorrectAnswer(scene);
            }
        });
    }

    showCorrectAnswer(scene) {
        // Show correct time by moving hands
        // Hour hand moves gradually (e.g., at 6:30 it's between 6 and 7)
        const correctHourAngle = ((this.currentHour % 12) * 30) + (this.currentMinute / 60 * 30);
        const correctMinuteAngle = (this.currentMinute / 5) * 30;

        // Animate hour hand and hitbox to correct position
        scene.tweens.add({
            targets: [this.hourHand, this.hourHitbox],
            angle: correctHourAngle,
            duration: 800,
            ease: 'Back.easeOut'
        });

        // Animate minute hand and hitbox to correct position
        scene.tweens.add({
            targets: [this.minuteHand, this.minuteHitbox],
            angle: correctMinuteAngle,
            duration: 800,
            ease: 'Back.easeOut'
        });

        // Change hand colors to gold
        this.hourHand.setFillStyle(0xFFD700);
        this.minuteHand.setFillStyle(0xFFD700);
    }

    resetHands() {
        // Reset hands and hitboxes to 12:00
        this.hourHand.angle = 0;
        this.minuteHand.angle = 0;
        this.hourHitbox.angle = 0;
        this.minuteHitbox.angle = 0;
        this.hourHand.setFillStyle(0x2C3E50);
        this.minuteHand.setFillStyle(0xE74C3C);
    }

    loadNextChallenge(scene) {
        // Clean up current UI
        this.cleanup(scene);
        this.isRevealing = false;

        // Generate new challenge
        this.generateChallenge();

        // Recreate UI for new challenge
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

    playClockAudio(scene) {
        // Stop any currently playing audio
        if (this.currentAudio && this.currentAudio.isPlaying) {
            this.currentAudio.stop();
        }

        // Build audio key based on time
        let audioKey;
        if (this.currentMinute === 30) {
            audioKey = `clock_audio_${this.currentHour}_30`;
        } else {
            audioKey = `clock_audio_${this.currentHour}`;
        }

        try {
            this.currentAudio = scene.sound.add(audioKey);
            this.currentAudio.play();
        } catch (error) {
            console.warn(`Audio not found: ${audioKey}`);
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
        this.hourHand = null;
        this.minuteHand = null;
        this.hourHitbox = null;
        this.minuteHitbox = null;
        this.clockGraphics = null;
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
