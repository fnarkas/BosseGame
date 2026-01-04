import Phaser from 'phaser';
import { WordEmojiMatchMode } from '../pokeballGameModes/WordEmojiMatchMode.js';
import { LetterListeningMode } from '../pokeballGameModes/LetterListeningMode.js';
import { LeftRightMode } from '../pokeballGameModes/LeftRightMode.js';

export class PokeballGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PokeballGameScene' });
        this.gameMode = null;
        this.pokeballCount = 0;
        this.pokeballCounterText = null;
        this.isProcessingAnswer = false;
        this.challengeCount = 0; // Track number of challenges completed
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Load pokeball count from registry
        this.pokeballCount = this.registry.get('pokeballCount') || 0;

        // Background
        this.add.rectangle(0, 0, width, height, 0x87CEEB).setOrigin(0);

        // Title
        this.add.text(width / 2, 60, 'Pokéball Spel', {
            font: 'bold 56px Arial',
            fill: '#FFD700',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Back button
        const backBtn = this.add.text(20, 20, '← Tillbaka', {
            font: '24px Arial',
            fill: '#ffffff',
            backgroundColor: '#FF6B6B',
            padding: { x: 15, y: 10 }
        }).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.gameMode.cleanup(this);
            this.scene.start('MainGameScene');
        });

        // Pokeball counter (top right)
        // Pokeball icon
        this.pokeballIcon = this.add.image(width - 90, 25, 'pokeball_poke-ball');
        this.pokeballIcon.setOrigin(0, 0);
        this.pokeballIcon.setScale(1.5);

        // Count text
        this.pokeballCounterText = this.add.text(width - 20, 32, `x${this.pokeballCount}`, {
            font: 'bold 32px Arial',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(1, 0);

        // Initialize game mode - alternate between modes
        this.selectGameMode();

        // Set up callback for game mode
        this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
            this.handleAnswer(isCorrect, answer, x, y);
        });

        // Start first challenge
        this.loadNextChallenge();
    }

    selectGameMode() {
        // Check if a specific mode is forced (for debug paths)
        const forcedMode = this.registry.get('pokeballGameMode');

        if (forcedMode === 'letter-only') {
            // Debug path: /letters - only show letter listening
            this.gameMode = new LetterListeningMode();
            console.log('Selected game mode: Letter Listening (forced)');
        } else if (forcedMode === 'word-emoji-only') {
            // Debug path: could add /words - only show word-emoji
            this.gameMode = new WordEmojiMatchMode();
            console.log('Selected game mode: Word-Emoji Match (forced)');
        } else if (forcedMode === 'directions-only') {
            // Debug path: /directions - only show left/right
            this.gameMode = new LeftRightMode();
            console.log('Selected game mode: Left/Right Directions (forced)');
        } else {
            // Normal mode: Alternate between game modes based on challenge count
            // Even challenges: Letter Listening, Odd challenges: Word-Emoji Match
            if (this.challengeCount % 2 === 0) {
                this.gameMode = new LetterListeningMode();
                console.log('Selected game mode: Letter Listening');
            } else {
                this.gameMode = new WordEmojiMatchMode();
                console.log('Selected game mode: Word-Emoji Match');
            }
        }
    }

    loadNextChallenge() {
        this.isProcessingAnswer = false;

        // Generate and display new challenge
        this.gameMode.generateChallenge();
        this.gameMode.createChallengeUI(this);
    }

    handleAnswer(isCorrect, answer, x, y) {
        if (this.isProcessingAnswer) return;
        this.isProcessingAnswer = true;

        if (isCorrect) {
            // Show success feedback
            this.showSuccessFeedback(x, y);

            // Award pokeball
            this.pokeballCount++;
            this.registry.set('pokeballCount', this.pokeballCount);
            localStorage.setItem('pokeballCount', this.pokeballCount.toString());

            // Update counter display
            this.pokeballCounterText.setText(`x${this.pokeballCount}`);

            // Show success message
            const successText = this.add.text(this.cameras.main.width / 2, 600, 'Rätt! +1 Pokéball', {
                font: 'bold 36px Arial',
                fill: '#27AE60',
                stroke: '#FFFFFF',
                strokeThickness: 4
            }).setOrigin(0.5);

            // Load next challenge after delay
            this.time.delayedCall(1500, () => {
                successText.destroy();
                this.gameMode.cleanup(this);

                // Increment challenge count and switch mode
                this.challengeCount++;
                this.selectGameMode();

                // Set up callback for new mode
                this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                    this.handleAnswer(isCorrect, answer, x, y);
                });

                this.loadNextChallenge();
            });
        } else {
            // Show error feedback
            this.showErrorFeedback(x, y);

            // Show error message
            const errorText = this.add.text(this.cameras.main.width / 2, 600, 'Fel! Försök igen', {
                font: 'bold 36px Arial',
                fill: '#E74C3C',
                stroke: '#FFFFFF',
                strokeThickness: 4
            }).setOrigin(0.5);

            // Remove error message and allow retry
            this.time.delayedCall(1000, () => {
                errorText.destroy();
                this.isProcessingAnswer = false;
            });
        }
    }

    showSuccessFeedback(x, y) {
        // Create star particle effect
        const graphics = this.add.graphics();
        graphics.fillStyle(0xFFD700, 1);

        // Draw a star
        const starPoints = 5;
        const outerRadius = 12;
        const innerRadius = 6;
        const centerOffset = 16;
        graphics.beginPath();
        for (let i = 0; i < starPoints * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / starPoints - Math.PI / 2;
            const px = centerOffset + radius * Math.cos(angle);
            const py = centerOffset + radius * Math.sin(angle);
            if (i === 0) {
                graphics.moveTo(px, py);
            } else {
                graphics.lineTo(px, py);
            }
        }
        graphics.closePath();
        graphics.fillPath();

        graphics.generateTexture('successStar', 32, 32);
        graphics.destroy();

        // Create particles
        const particles = this.add.particles(x, y, 'successStar', {
            speed: { min: 100, max: 200 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.2, end: 0 },
            lifespan: 800,
            gravityY: 150,
            quantity: 20
        });
        particles.setDepth(100);
        particles.explode();

        // Clean up
        this.time.delayedCall(1000, () => {
            particles.destroy();
        });
    }

    showErrorFeedback(x, y) {
        // Red flash effect on the incorrect button would be handled by the mode
        // For now, just show a simple shake
        // (We could enhance this later)
    }
}
