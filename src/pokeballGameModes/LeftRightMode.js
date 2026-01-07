import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

export class LeftRightMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;
        this.totalAttempts = 0;
        this.maxAttempts = 25;
        this.requiredCorrect = 6;
        this.ballIndicators = [];
        this.currentAudio = null;
        this.isRevealing = false; // Track if we're showing the answer
        this.leftZone = null;
        this.rightZone = null;
    }

    generateChallenge() {
        // Randomly choose left or right using Math.random for better randomization
        const directions = ['vanster', 'hoger'];
        const randomIndex = Math.floor(Math.random() * directions.length);
        const correctDirection = directions[randomIndex];

        this.challengeData = {
            correctDirection: correctDirection,
            displayName: correctDirection === 'hoger' ? 'Höger' : 'Vänster'
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Speaker button to replay audio (centered at top)
        const speakerBtn = scene.add.text(width / 2, 200, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            this.playDirectionAudio(scene, this.challengeData.correctDirection);
        });
        this.uiElements.push(speakerBtn);

        // Vertical dividing line in the middle
        const divider = scene.add.graphics();
        divider.lineStyle(4, 0x000000, 1);
        divider.lineBetween(width / 2, 300, width / 2, height - 100);
        this.uiElements.push(divider);

        // Create clickable zones for left and right (both same neutral color)
        this.leftZone = scene.add.rectangle(width / 4, height / 2 + 50, width / 2 - 20, 300, 0xFFFFFF, 0.2)
            .setInteractive({ useHandCursor: true });

        this.leftZone.on('pointerdown', () => {
            if (!this.isRevealing) {
                this.handleAnswer(scene, 'vanster');
            }
        });
        this.uiElements.push(this.leftZone);

        this.rightZone = scene.add.rectangle(3 * width / 4, height / 2 + 50, width / 2 - 20, 300, 0xFFFFFF, 0.2)
            .setInteractive({ useHandCursor: true });

        this.rightZone.on('pointerdown', () => {
            if (!this.isRevealing) {
                this.handleAnswer(scene, 'hoger');
            }
        });
        this.uiElements.push(this.rightZone);

        // Create 6 ball indicators showing progress
        this.createBallIndicators(scene);

        // Play direction audio automatically when challenge loads
        this.playDirectionAudio(scene, this.challengeData.correctDirection);
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - 180;
        const y = 500;
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

    playDirectionAudio(scene, direction) {
        const audioKey = `direction_audio_${direction}`;

        // Stop any currently playing audio
        if (this.currentAudio && this.currentAudio.isPlaying) {
            this.currentAudio.stop();
        }

        // Play the audio
        this.currentAudio = scene.sound.add(audioKey);
        this.currentAudio.play();
    }

    handleAnswer(scene, selectedDirection) {
        const isCorrect = selectedDirection === this.challengeData.correctDirection;

        this.totalAttempts++;

        if (isCorrect) {
            this.correctInRow++;
            this.updateBallIndicators();

            // Show success particles
            const correctZone = selectedDirection === 'vanster' ? this.leftZone : this.rightZone;
            this.showSuccessParticles(scene, correctZone.x, correctZone.y);

            // Check if we've reached 6 correct in a row
            if (this.correctInRow >= this.requiredCorrect) {
                // Success! Award coins
                scene.time.delayedCall(500, () => {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.answerCallback(true, selectedDirection, x, y);
                });
            } else {
                // Correct but need more - just update UI and load next
                this.loadNextQuestion(scene);
            }
        } else {
            // Wrong answer - simple red flash, then reset streak and continue
            this.showWrongAnswerFeedback(scene, selectedDirection);
        }
    }

    loadNextQuestion(scene) {
        // Small delay before loading next question
        scene.time.delayedCall(500, () => {
            // Clean up current UI
            this.cleanup(scene);

            // Generate new challenge
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
    }

    showWrongAnswerFeedback(scene, selectedDirection) {
        // Track wrong answer
        trackWrongAnswer(
            'LeftRightMode',
            this.challengeData.correctDirection,
            selectedDirection
        );

        this.isRevealing = true;

        // Determine which zone was clicked wrong
        const wrongZone = selectedDirection === 'vanster' ? this.leftZone : this.rightZone;

        // Flash red on wrong zone
        wrongZone.setFillStyle(0xFF0000, 0.6);

        // Shake animation on wrong zone
        const originalX = wrongZone.x;
        scene.tweens.add({
            targets: wrongZone,
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                // Reset wrong zone
                wrongZone.setFillStyle(0xFFFFFF, 0.2);
                wrongZone.x = originalX;

                // Show sad emoji - GAME OVER
                const sadEmoji = scene.add.text(scene.cameras.main.width / 2, 500, '😢', {
                    fontSize: '120px'
                }).setOrigin(0.5).setDepth(1000);

                // Fade out sad emoji and then return to dice scene
                scene.tweens.add({
                    targets: sadEmoji,
                    alpha: 0,
                    scale: 1.5,
                    duration: 1500,
                    ease: 'Cubic.easeOut',
                    onComplete: () => {
                        sadEmoji.destroy();

                        // GAME OVER - clean up and reload the scene to show dice again
                        this.cleanup(scene);

                        // Reset game state
                        this.correctInRow = 0;

                        // Restart the scene (will show dice animation since no coins earned)
                        scene.scene.restart();
                    }
                });
            }
        });
    }

    showSuccessParticles(scene, x, y) {
        // Create star-shaped particle texture if it doesn't exist
        if (!scene.textures.exists('star')) {
            const particleGraphics = scene.add.graphics();
            particleGraphics.fillStyle(0xFFFF00, 1);
            particleGraphics.lineStyle(2, 0xFFD700);

            // Draw a star shape
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
        // Stop any playing audio
        if (this.currentAudio && this.currentAudio.isPlaying) {
            this.currentAudio.stop();
        }
        this.currentAudio = null;

        // Clear ball indicators
        this.ballIndicators = [];

        // Clear zone references
        this.leftZone = null;
        this.rightZone = null;

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
