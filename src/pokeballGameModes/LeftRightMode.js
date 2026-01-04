import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';

export class LeftRightMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;
        this.totalAttempts = 0;
        this.maxAttempts = 25;
        this.requiredCorrect = 6;
        this.ballIndicators = [];
        this.currentAudio = null;
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
            font: '80px Arial'
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

        // Create clickable zones for left and right
        const leftZone = scene.add.rectangle(width / 4, height / 2 + 50, width / 2 - 20, 300, 0x4A90E2, 0.3)
            .setInteractive({ useHandCursor: true });

        leftZone.on('pointerdown', () => {
            this.handleAnswer(scene, 'vanster');
        });
        this.uiElements.push(leftZone);

        const rightZone = scene.add.rectangle(3 * width / 4, height / 2 + 50, width / 2 - 20, 300, 0xE74C3C, 0.3)
            .setInteractive({ useHandCursor: true });

        rightZone.on('pointerdown', () => {
            this.handleAnswer(scene, 'hoger');
        });
        this.uiElements.push(rightZone);

        // Create 6 ball indicators showing progress
        this.createBallIndicators(scene);

        // Play direction audio automatically when challenge loads
        this.playDirectionAudio(scene, this.challengeData.correctDirection);
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - 150;
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

            // Check if we've reached 6 correct in a row
            if (this.correctInRow >= this.requiredCorrect) {
                // Success! Award pokeball
                const x = scene.cameras.main.width / 2;
                const y = scene.cameras.main.height / 2;
                this.answerCallback(true, selectedDirection, x, y);
            } else {
                // Correct but need more - just update UI and load next
                this.loadNextQuestion(scene);
            }
        } else {
            // Wrong answer - reset streak
            this.correctInRow = 0;
            this.updateBallIndicators();

            // Check if we've hit max attempts
            if (this.totalAttempts >= this.maxAttempts) {
                // Failed - no pokeball awarded, but show feedback
                const x = scene.cameras.main.width / 2;
                const y = scene.cameras.main.height / 2;
                this.answerCallback(false, selectedDirection, x, y);
            } else {
                // Show error feedback briefly then continue
                this.showErrorFeedback(scene, selectedDirection);
            }
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

    showErrorFeedback(scene, selectedDirection) {
        // Show brief error message
        const errorText = scene.add.text(scene.cameras.main.width / 2, 600,
            'Fel! Försök igen', {
            font: 'bold 32px Arial',
            fill: '#E74C3C',
            stroke: '#FFFFFF',
            strokeThickness: 4
        }).setOrigin(0.5);

        scene.time.delayedCall(800, () => {
            errorText.destroy();
            this.loadNextQuestion(scene);
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

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
