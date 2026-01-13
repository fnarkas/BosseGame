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

        // Initialize game mode - alternate between modes
        this.selectGameMode();

        // Set up callback for game mode
        this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
            this.handleAnswer(isCorrect, answer, x, y);
        });

        // Check if we should show the dice animation (not for forced/debug modes)
        if (!forcedMode) {
            // Show dice rolling animation before starting the game
            this.showDiceRollAnimation();
        } else {
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
        } else {
            // Normal mode: Randomly select from all game modes with configurable probabilities
            this.gameMode = this.selectRandomGameMode();
        }
    }

    selectRandomGameMode() {
        // Configurable weights for each game mode
        // Higher weight = higher probability of being selected
        const DEFAULT_MODE_WEIGHTS = {
            letterListening: 10,     // ~8.3% chance
            wordEmoji: 10,           // ~8.3% chance
            emojiWord: 10,           // ~8.3% chance
            leftRight: 10,           // ~8.3% chance
            letterDragMatch: 10,     // ~8.3% chance
            speechRecognition: 10,   // ~8.3% chance
            numberListening: 10,     // ~8.3% chance
            wordSpelling: 40,        // ~33.3% chance
            legendary: 10            // ~8.3% chance
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
                          MODE_WEIGHTS.legendary;

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

        // Create booster bar for dice scene (above overlay)
        const diceBoosterBar = createBoosterBar(this, width / 2, 60, 1002);
        const currentStreak = getStreak();
        updateBoosterBar(diceBoosterBar, currentStreak, this);

        // Pokemon catching button (top left) - exit back to catching Pokemon
        const pokeballBtn = this.add.image(70, 50, 'pokeball_poke-ball');
        pokeballBtn.setScale(0.8); // 64px * 0.8 = ~51px
        pokeballBtn.setDepth(1002);
        pokeballBtn.setInteractive({ useHandCursor: true });

        pokeballBtn.on('pointerdown', () => {
            // Clean up dice animation
            overlay.destroy();
            diceSprite.destroy();
            gameIcons.forEach(icon => icon.destroy());
            gameDiceFaces.forEach(face => face.destroy());
            pokeballBtn.destroy();
            destroyBoosterBar(diceBoosterBar);

            // Clean up game mode and return to Pokemon catching
            this.gameMode.cleanup(this);
            this.scene.start('MainGameScene');
        });

        // Map game mode to dice face and icon
        const gameModeMap = {
            'LetterListeningMode': { face: 1, icon: 'game-mode-letter' },
            'WordEmojiMatchMode': { face: 2, icon: 'game-mode-word' },
            'EmojiWordMatchMode': { face: 3, icon: 'game-mode-emojiword' },
            'LeftRightMode': { face: 4, icon: 'game-mode-directions' },
            'LetterDragMatchMode': { face: 5, icon: 'game-mode-lettermatch' },
            'SpeechRecognitionMode': { face: 6, icon: 'game-mode-speech' },
            'NumberListeningMode': { face: 7, icon: 'game-mode-numbers' },
            'WordSpellingMode': { face: 8, icon: 'game-mode-spelling' },
            'LegendaryAlphabetMatchMode': { face: 9, icon: 'game-mode-legendary' }
        };

        const selectedMode = gameModeMap[this.gameMode.constructor.name];
        const selectedFace = selectedMode.face;

        // Create dice sprite in center
        const diceSprite = this.add.image(width / 2, height / 2 - 150, `dice-face-1`);
        diceSprite.setScale(2);
        diceSprite.setDepth(1001);
        diceSprite.setInteractive({ useHandCursor: true });

        // Add pulsing animation to dice to show it's interactive
        this.tweens.add({
            targets: diceSprite,
            scale: 2.1,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Create 9 game mode icons in a single row below the dice
        const iconSize = 60;
        const spacing = 45; // Adjusted for 9 icons
        const totalWidth = (iconSize * 9) + (spacing * 8);
        const startX = (width - totalWidth) / 2 + iconSize / 2;
        const iconY = height / 2 + 200; // Increased spacing from dice

        const gameIcons = [];
        const gameDiceFaces = [];
        const iconKeys = ['game-mode-letter', 'game-mode-word', 'game-mode-emojiword', 'game-mode-directions', 'game-mode-lettermatch', 'game-mode-speech', 'game-mode-numbers', 'game-mode-spelling', 'game-mode-legendary'];

        iconKeys.forEach((key, index) => {
            const x = startX + index * (iconSize + spacing);

            // Game mode icon
            const icon = this.add.image(x, iconY, key);
            icon.setScale(0.4);
            icon.setAlpha(0.3); // Start faded
            icon.setDepth(1001);
            gameIcons.push(icon);

            // Small dice face above the icon showing what number it corresponds to
            const diceFace = this.add.image(x, iconY - 100, `dice-face-${index + 1}`); // Reduced gap for smaller icons
            diceFace.setScale(0.4);
            diceFace.setAlpha(0.3); // Start faded
            diceFace.setDepth(1001);
            gameDiceFaces.push(diceFace);
        });

        // Wait for player to click the dice to start rolling
        diceSprite.once('pointerdown', () => {
            // Stop pulsing animation on dice
            this.tweens.killTweensOf(diceSprite);
            diceSprite.setScale(2);

            // Hide pokeball button when dice starts rolling
            pokeballBtn.destroy();

            // Start the rolling animation
            this.startDiceRoll(diceSprite, selectedFace, gameIcons, gameDiceFaces, overlay, diceBoosterBar);
        });
    }

    startDiceRoll(diceSprite, selectedFace, gameIcons, gameDiceFaces, overlay, diceBoosterBar) {
        // Rolling animation - cycle through faces (shorter)
        let rollCount = 0;
        const maxRolls = 12; // Reduced from 20
        const rollTimer = this.time.addEvent({
            delay: 80, // Start faster (was 100ms)
            callback: () => {
                rollCount++;

                // Show random face
                const randomFace = Phaser.Math.Between(1, 8);
                diceSprite.setTexture(`dice-face-${randomFace}`);

                // Shake effect
                diceSprite.setScale(2.2);
                this.tweens.add({
                    targets: diceSprite,
                    scale: 2,
                    duration: 50
                });

                // Slow down over time
                if (rollCount < maxRolls) {
                    rollTimer.delay = Math.min(rollTimer.delay + 25, 350); // Faster progression
                } else {
                    // Final roll - land on selected face
                    rollTimer.destroy();

                    diceSprite.setTexture(`dice-face-${selectedFace}`);

                    // Highlight the selected game icon and its dice face
                    const selectedIconIndex = selectedFace - 1;
                    const selectedIcon = gameIcons[selectedIconIndex];
                    const selectedDiceFace = gameDiceFaces[selectedIconIndex];

                    this.tweens.add({
                        targets: [selectedIcon, selectedDiceFace],
                        alpha: 1,
                        scale: 0.9,
                        duration: 500,
                        ease: 'Back.easeOut'
                    });

                    // Pulse animation on selected icon
                    this.tweens.add({
                        targets: selectedIcon,
                        scaleX: 1.0,
                        scaleY: 1.0,
                        duration: 400,
                        yoyo: true,
                        repeat: 2
                    });

                    // Wait then transition to game (shorter wait)
                    this.time.delayedCall(1500, () => { // Reduced from 2000
                        // Clean up
                        overlay.destroy();
                        diceSprite.destroy();
                        gameIcons.forEach(icon => icon.destroy());
                        gameDiceFaces.forEach(face => face.destroy());
                        destroyBoosterBar(diceBoosterBar);

                        // Start the actual game
                        this.loadNextChallenge();
                    });
                }
            },
            loop: true
        });
    }

    loadNextChallenge() {
        this.isProcessingAnswer = false;

        // Show/hide booster bar based on game mode
        const isLegendaryMode = this.gameMode.constructor.name === 'LegendaryAlphabetMatchMode';
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
            const isLegendaryMode = this.gameMode.constructor.name === 'LegendaryAlphabetMatchMode';

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

            // Show gift box reward animation (with or without multiplier)
            showGiftBoxReward(this, finalCoinReward, isLegendaryMode ? null : multiplier, () => {
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
            const isLegendaryMode = this.gameMode.constructor.name === 'LegendaryAlphabetMatchMode';
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
