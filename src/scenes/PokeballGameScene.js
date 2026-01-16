import Phaser from 'phaser';
import { WordEmojiMatchMode } from '../pokeballGameModes/WordEmojiMatchMode.js';
import { EmojiWordMatchMode } from '../pokeballGameModes/EmojiWordMatchMode.js';
import { LetterListeningMode } from '../pokeballGameModes/LetterListeningMode.js';
import { LeftRightMode } from '../pokeballGameModes/LeftRightMode.js';
import { LetterDragMatchMode } from '../pokeballGameModes/LetterDragMatchMode.js';
import { SpeechRecognitionMode } from '../pokeballGameModes/SpeechRecognitionMode.js';
import { NumberListeningMode } from '../pokeballGameModes/NumberListeningMode.js';
import { WordSpellingMode } from '../pokeballGameModes/WordSpellingMode.js';
import { LegendaryAlphabetMatchMode } from '../pokeballGameModes/LegendaryAlphabetMatchMode.js';
import { LegendaryNumbersMode } from '../pokeballGameModes/LegendaryNumbersMode.js';
import { getCoinCount, addCoins, getRandomCoinReward } from '../currency.js';
import { showGiftBoxReward } from '../rewardAnimation.js';
import { getStreak, incrementStreak, resetStreak, getMultiplier } from '../streak.js';
import { createBoosterBar, updateBoosterBar, destroyBoosterBar, hideBoosterBar, showBoosterBar } from '../boosterBar.js';

export class PokeballGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PokeballGameScene' });
        this.gameMode = null;
        this.coinCount = 0;
        this.coinCounterText = null;
        this.isProcessingAnswer = false;
        this.challengeCount = 0; // Track number of challenges completed
        this.boosterBarElements = null; // Booster bar UI elements
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Load coin count from localStorage
        this.coinCount = getCoinCount();

        // Background
        this.add.rectangle(0, 0, width, height, 0x87CEEB).setOrigin(0);

        // Pokedex button (top left)
        const pokedexBtn = this.add.text(80, 40, '📖', {
            fontSize: '48px'
        });
        pokedexBtn.setOrigin(0.5);
        pokedexBtn.setInteractive({ useHandCursor: true });
        pokedexBtn.setDepth(1002); // Above overlay

        pokedexBtn.on('pointerover', () => {
            pokedexBtn.setScale(1.1);
        });

        pokedexBtn.on('pointerout', () => {
            pokedexBtn.setScale(1.0);
        });

        pokedexBtn.on('pointerdown', () => {
            // Pause this scene
            this.scene.pause();
            // Show Pokedex with resume callback
            window.showPokedex(() => {
                // Resume this scene when Pokedex closes
                this.scene.resume();
            });
        });

        // Store button (top right, before coin counter)
        const storeBtn = this.add.image(width - 160, 52, 'store-icon');
        storeBtn.setOrigin(1, 0.5);
        storeBtn.setScale(0.5); // 128px * 0.5 = 64px
        storeBtn.setInteractive({ useHandCursor: true });
        storeBtn.setDepth(1002); // Above overlay

        storeBtn.on('pointerdown', () => {
            window.openStore();
        });

        // Coin counter (top right)
        // Coin sprite (using tiny version for better quality)
        const coinIcon = this.add.image(width - 110, 40, 'coin-tiny');
        coinIcon.setOrigin(0, 0.5);
        coinIcon.setScale(1.25); // 64px * 1.25 = 80px
        coinIcon.setDepth(1002); // Above overlay

        // Count text
        this.coinCounterText = this.add.text(width - 20, 32, `${this.coinCount}`, {
            font: 'bold 32px Arial',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(1, 0);
        this.coinCounterText.setDepth(1002); // Above overlay

        // Check if we're in forced/debug mode
        const forcedMode = this.registry.get('pokeballGameMode');

        // Create booster bar at top center (hide for legendary mode)
        if (forcedMode !== 'legendary-only') {
            this.boosterBarElements = createBoosterBar(this, width / 2, 60, 1002);
            const currentStreak = getStreak();
            updateBoosterBar(this.boosterBarElements, currentStreak, this);
        }

        // Check if we should show the dice animation (not for forced/debug modes)
        if (!forcedMode) {
            // Initialize game mode - this will be shown on the wheel
            this.selectGameMode();

            // Set up callback for game mode
            this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                this.handleAnswer(isCorrect, answer, x, y);
            });

            // Show dice rolling animation before starting the game
            this.showDiceRollAnimation();
        } else {
            // Debug mode: Initialize game mode and start immediately
            this.selectGameMode();

            // Set up callback for game mode
            this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                this.handleAnswer(isCorrect, answer, x, y);
            });

            // Start first challenge immediately for debug modes
            this.loadNextChallenge();
        }
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
        } else if (forcedMode === 'lettermatch-only') {
            // Debug path: /lettermatch - only show letter drag match
            this.gameMode = new LetterDragMatchMode();
            console.log('Selected game mode: Letter Drag Match (forced)');
        } else if (forcedMode === 'speech-only') {
            // Debug path: /speech - only show speech recognition
            this.gameMode = new SpeechRecognitionMode();
            console.log('Selected game mode: Speech Recognition (forced)');
        } else if (forcedMode === 'numbers-only') {
            // Debug path: /numbers - only show number listening
            this.gameMode = new NumberListeningMode();
            console.log('Selected game mode: Number Listening (forced)');
        } else if (forcedMode === 'emojiword-only') {
            // Debug path: /emojiword - only show emoji-word match
            this.gameMode = new EmojiWordMatchMode();
            console.log('Selected game mode: Emoji-Word Match (forced)');
        } else if (forcedMode === 'wordspelling-only') {
            // Debug path: /wordspelling - only show word spelling
            this.gameMode = new WordSpellingMode();
            console.log('Selected game mode: Word Spelling (forced)');
        } else if (forcedMode === 'legendary-only') {
            // Debug path: /legendary - legendary alphabet match challenge
            this.gameMode = new LegendaryAlphabetMatchMode();
            console.log('Selected game mode: Legendary Alphabet Match (forced)');
        } else if (forcedMode === 'legendary-numbers-only') {
            // Debug path: /legendarynumbers - legendary numbers challenge
            this.gameMode = new LegendaryNumbersMode();
            console.log('Selected game mode: Legendary Numbers (forced)');
        } else {
            // Normal mode: Randomly select from all game modes with configurable probabilities
            this.gameMode = this.selectRandomGameMode();
        }
    }

    selectRandomGameMode() {
        // Configurable weights for each game mode
        // Higher weight = higher probability of being selected
        const DEFAULT_MODE_WEIGHTS = {
            letterListening: 10,
            wordEmoji: 10,
            emojiWord: 10,
            leftRight: 10,
            letterDragMatch: 10,
            speechRecognition: 10,
            numberListening: 10,
            wordSpelling: 40,
            legendary: 10,
            legendaryNumbers: 10
        };

        // Load custom weights from localStorage, or use defaults
        const savedWeights = localStorage.getItem('minigameWeights');
        const MODE_WEIGHTS = savedWeights ? JSON.parse(savedWeights) : DEFAULT_MODE_WEIGHTS;

        // Calculate total weight
        const totalWeight = MODE_WEIGHTS.letterListening +
                          MODE_WEIGHTS.wordEmoji +
                          MODE_WEIGHTS.emojiWord +
                          MODE_WEIGHTS.leftRight +
                          MODE_WEIGHTS.letterDragMatch +
                          MODE_WEIGHTS.speechRecognition +
                          MODE_WEIGHTS.numberListening +
                          MODE_WEIGHTS.wordSpelling +
                          MODE_WEIGHTS.legendary +
                          MODE_WEIGHTS.legendaryNumbers;

        // Generate random number between 0 and total weight
        const random = Math.random() * totalWeight;

        // Select mode based on weighted random
        let currentWeight = 0;

        currentWeight += MODE_WEIGHTS.letterListening;
        if (random < currentWeight) {
            console.log('Selected game mode: Letter Listening');
            return new LetterListeningMode();
        }

        currentWeight += MODE_WEIGHTS.wordEmoji;
        if (random < currentWeight) {
            console.log('Selected game mode: Word-Emoji Match');
            return new WordEmojiMatchMode();
        }

        currentWeight += MODE_WEIGHTS.emojiWord;
        if (random < currentWeight) {
            console.log('Selected game mode: Emoji-Word Match');
            return new EmojiWordMatchMode();
        }

        currentWeight += MODE_WEIGHTS.leftRight;
        if (random < currentWeight) {
            console.log('Selected game mode: Left/Right Directions');
            return new LeftRightMode();
        }

        currentWeight += MODE_WEIGHTS.letterDragMatch;
        if (random < currentWeight) {
            console.log('Selected game mode: Letter Drag Match');
            return new LetterDragMatchMode();
        }

        currentWeight += MODE_WEIGHTS.speechRecognition;
        if (random < currentWeight) {
            console.log('Selected game mode: Speech Recognition');
            return new SpeechRecognitionMode();
        }

        currentWeight += MODE_WEIGHTS.numberListening;
        if (random < currentWeight) {
            console.log('Selected game mode: Number Listening');
            return new NumberListeningMode();
        }

        currentWeight += MODE_WEIGHTS.legendary;
        if (random < currentWeight) {
            console.log('Selected game mode: Legendary Alphabet Match');
            return new LegendaryAlphabetMatchMode();
        }

        currentWeight += MODE_WEIGHTS.legendaryNumbers;
        if (random < currentWeight) {
            console.log('Selected game mode: Legendary Numbers');
            return new LegendaryNumbersMode();
        }

        // Default to Word Spelling
        console.log('Selected game mode: Word Spelling');
        return new WordSpellingMode();
    }

    showDiceRollAnimation() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Create semi-transparent overlay
        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
        overlay.setDepth(1000);

        // Create booster bar for wheel scene (above overlay)
        const wheelBoosterBar = createBoosterBar(this, width / 2, 60, 1002);
        const currentStreak = getStreak();
        updateBoosterBar(wheelBoosterBar, currentStreak, this);

        // Pokemon catching button (top left) - exit back to catching Pokemon
        const pokeballBtn = this.add.image(70, 50, 'pokeball_poke-ball');
        pokeballBtn.setScale(0.8);
        pokeballBtn.setDepth(1002);
        pokeballBtn.setInteractive({ useHandCursor: true });

        pokeballBtn.on('pointerdown', () => {
            // Clean up wheel animation
            overlay.destroy();
            wheelSprite.destroy();
            pointerSprite.destroy();
            pokeballBtn.destroy();
            destroyBoosterBar(wheelBoosterBar);

            // Clean up game mode and return to Pokemon catching
            this.gameMode.cleanup(this);
            this.scene.start('MainGameScene');
        });

        // Map game mode to slice number (1-10)
        const gameModeMap = {
            'LetterListeningMode': 1,
            'WordEmojiMatchMode': 2,
            'EmojiWordMatchMode': 3,
            'LeftRightMode': 4,
            'LetterDragMatchMode': 5,
            'SpeechRecognitionMode': 6,
            'NumberListeningMode': 7,
            'WordSpellingMode': 8,
            'LegendaryAlphabetMatchMode': 9,
            'LegendaryNumbersMode': 10
        };

        const selectedSlice = gameModeMap[this.gameMode.constructor.name];

        // Create wheel sprite in center
        const wheelSprite = this.add.image(width / 2, height / 2, 'game-wheel');
        wheelSprite.setScale(0.8);
        wheelSprite.setDepth(1001);
        wheelSprite.setInteractive({ useHandCursor: true });

        // Create pointer at top center
        const pointerSprite = this.add.image(width / 2, height / 2 - 250, 'wheel-pointer');
        pointerSprite.setAngle(180); // Rotate 180 degrees to point down at wheel
        pointerSprite.setDepth(1003);

        // Add pulsing animation to wheel to show it's interactive
        this.tweens.add({
            targets: wheelSprite,
            scale: 0.85,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Wait for player to click the wheel to start spinning
        wheelSprite.once('pointerdown', () => {
            // Stop pulsing animation
            this.tweens.killTweensOf(wheelSprite);
            wheelSprite.setScale(0.8);

            // Hide pokeball button when wheel starts spinning
            pokeballBtn.destroy();

            // Start the spinning animation
            this.startWheelSpin(wheelSprite, pointerSprite, selectedSlice, overlay, wheelBoosterBar);
        });
    }

    startWheelSpin(wheelSprite, pointerSprite, selectedSlice, overlay, wheelBoosterBar) {
        // Calculate target rotation
        // The wheel is generated in BootScene with 10 slices
        // Slices are drawn starting at index 0 at the TOP (-90° in canvas coordinates)
        // They proceed clockwise: index 0, 1, 2, ... 9
        // The pointer is FIXED at the top pointing down
        // selectedSlice is 1-10, so convert to index 0-9

        const sliceIndex = selectedSlice - 1; // Convert 1-10 to 0-9
        const sliceAngle = 36; // 360 / 10 slices

        // Index 0 is already at top (0° rotation needed)
        // To bring index 1 to top, rotate -36° (counterclockwise)
        // To bring index N to top, rotate -(N * 36)°
        const targetRotation = -sliceIndex * sliceAngle;

        // Add 3-5 full rotations (clockwise, positive degrees) for spinning effect
        const fullRotations = Phaser.Math.Between(3, 5) * 360;

        // Add random offset within the slice for natural feel (±12 degrees)
        const randomOffset = Phaser.Math.Between(-12, 12);

        // Total rotation: spin clockwise multiple times, then settle on target
        const totalRotation = fullRotations + targetRotation + randomOffset;

        // Spin the wheel
        this.tweens.add({
            targets: wheelSprite,
            angle: totalRotation,
            duration: 4000,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // Bounce the pointer when wheel stops
                this.tweens.add({
                    targets: pointerSprite,
                    y: pointerSprite.y + 15,
                    duration: 150,
                    yoyo: true,
                    repeat: 2,
                    ease: 'Bounce.easeOut'
                });

                // Wait then transition to game
                this.time.delayedCall(1000, () => {
                    // Clean up
                    overlay.destroy();
                    wheelSprite.destroy();
                    pointerSprite.destroy();
                    destroyBoosterBar(wheelBoosterBar);

                    // Start the actual game
                    this.loadNextChallenge();
                });
            }
        });
    }

    loadNextChallenge() {
        this.isProcessingAnswer = false;

        // Show/hide booster bar based on game mode
        const modeName = this.gameMode.constructor.name;
        const isLegendaryMode = modeName === 'LegendaryAlphabetMatchMode' || modeName === 'LegendaryNumbersMode';
        if (isLegendaryMode) {
            hideBoosterBar(this.boosterBarElements);
        } else {
            showBoosterBar(this.boosterBarElements);
        }

        // Load config if needed, then generate challenge
        if (this.gameMode.loadConfig && !this.gameMode.configLoaded) {
            this.gameMode.loadConfig().then(() => {
                this.gameMode.generateChallenge();
                this.gameMode.createChallengeUI(this);
            });
        } else {
            this.gameMode.generateChallenge();
            this.gameMode.createChallengeUI(this);
        }
    }

    handleAnswer(isCorrect, answer, x, y) {
        if (this.isProcessingAnswer) return;
        this.isProcessingAnswer = true;

        if (isCorrect) {
            // Check if this is legendary mode
            const modeName = this.gameMode.constructor.name;
            const isLegendaryMode = modeName === 'LegendaryAlphabetMatchMode' || modeName === 'LegendaryNumbersMode';

            // Increment streak and get multiplier (only for non-legendary modes)
            let newStreak, multiplier, baseCoinReward, finalCoinReward;

            if (!isLegendaryMode) {
                newStreak = incrementStreak();
                multiplier = getMultiplier();

                // Update booster bar
                updateBoosterBar(this.boosterBarElements, newStreak, this);

                // Generate random coin reward (1-3)
                baseCoinReward = getRandomCoinReward();
                finalCoinReward = baseCoinReward * multiplier;
            } else {
                // Legendary mode: use configured coin reward, no multiplier
                multiplier = null;
                finalCoinReward = this.gameMode.config.coinReward;
            }

            // Show success feedback particles
            this.showSuccessFeedback(x, y);

            // Show reward animation (gift box for normal, treasure chest for legendary)
            showGiftBoxReward(this, finalCoinReward, isLegendaryMode ? null : multiplier, isLegendaryMode, () => {
                // Animation complete - update coin count
                this.coinCount = addCoins(finalCoinReward);
                this.coinCounterText.setText(`${this.coinCount}`);

                // Clean up and load next challenge
                this.gameMode.cleanup(this);

                // Increment challenge count and switch mode
                this.challengeCount++;
                this.selectGameMode();

                // Set up callback for new mode
                this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                    this.handleAnswer(isCorrect, answer, x, y);
                });

                // Check if we should show dice animation (not for forced/debug modes)
                const forcedMode = this.registry.get('pokeballGameMode');
                if (!forcedMode) {
                    // Show dice rolling animation before next challenge
                    this.showDiceRollAnimation();
                } else {
                    // Debug mode - go straight to next challenge
                    this.loadNextChallenge();
                }
            });
        } else {
            // Reset streak on wrong answer (not for legendary mode)
            const modeName = this.gameMode.constructor.name;
            const isLegendaryMode = modeName === 'LegendaryAlphabetMatchMode' || modeName === 'LegendaryNumbersMode';
            if (!isLegendaryMode) {
                const newStreak = resetStreak();
                updateBoosterBar(this.boosterBarElements, newStreak, this);
            }

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
