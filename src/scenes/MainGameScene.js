import Phaser from 'phaser';
import { LetterMatchMode } from '../answerModes/LetterMatchMode.js';
import { DebugMode } from '../answerModes/DebugMode.js';
import { createInventoryHUD, updateInventoryHUD } from '../inventoryHUD.js';
import { hasPokeballs, removePokeball, getInventory, POKEBALL_TYPES } from '../inventory.js';
import { showPokeballSelector } from '../pokeballSelector.js';
import { getRarityInfo, attemptCatch } from '../pokemonRarity.js';
import { getCoinCount, deductCoins } from '../currency.js';

export class MainGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainGameScene' });
        this.currentPokemon = null;
        this.currentPokemonSprite = null;
        this.attemptsLeft = 3;
        this.isAnimating = false; // Prevent multiple clicks during animation
        this.answerMode = null; // Will be set in create() based on game mode
        this.inventoryHUD = null;
        this.selectedPokeballType = 'pokeball'; // Default to regular pokeball

        // Depth constants for layering
        this.DEPTH = {
            PARTICLES: 50,
            POKEBALL: 51,
            POPUP_OVERLAY: 200,
            POPUP_BACKGROUND: 201,
            POPUP_CONTENT: 202,
            POPUP_BUTTON_TEXT: 203
        };

        // Animation constants
        this.ANIMATION = {
            POKEBALL_THROW_DURATION: 500,
            POKEBALL_WIGGLE_COUNT: 3,
            POKEBALL_WIGGLE_INITIAL_ANGLE: 20,
            PARTICLE_BURST_COUNT: [50, 40, 30],
            PARTICLE_BURST_DELAYS: [0, 150, 300],
            SUCCESS_POPUP_DELAY: 1000
        };
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Initialize answer mode based on registry
        const modeName = this.registry.get('answerMode') || 'letter';
        console.log('Initializing answer mode:', modeName);

        if (modeName === 'debug') {
            this.answerMode = new DebugMode();
        } else {
            // Configure letter match mode - will load config from server
            this.answerMode = new LetterMatchMode({
                nameCase: 'uppercase', // Default, will be overridden by server config
                alphabetCase: 'lowercase' // Default, will be overridden by server config
            });
        }

        // Set up callback for answer mode
        this.answerMode.setAnswerCallback((isCorrect) => {
            this.handleAnswer(isCorrect);
        });

        // Background
        this.add.rectangle(0, 0, width, height, 0x87CEEB).setOrigin(0);

        // Create inventory HUD (top left)
        this.inventoryHUD = createInventoryHUD(this, 150, 20);

        // Store button (icon sprite)
        const storeBtn = this.add.image(width - 160, 52, 'store-icon');
        storeBtn.setOrigin(1, 0.5);
        storeBtn.setScale(0.5); // 128px * 0.5 = 64px
        storeBtn.setInteractive({ useHandCursor: true });

        storeBtn.on('pointerdown', () => {
            window.openStore();
        });

        // Mini-game button (dice icon sprite)
        const diceBtn = this.add.image(width - 90, 52, 'dice-icon');
        diceBtn.setOrigin(1, 0.5);
        diceBtn.setScale(0.5); // 128px * 0.5 = 64px
        diceBtn.setInteractive({ useHandCursor: true });

        diceBtn.on('pointerdown', () => {
            // Save current Pokemon to registry before leaving
            if (this.currentPokemon) {
                this.registry.set('currentPokemon', this.currentPokemon);
            }
            this.scene.start('PokeballGameScene');
        });

        // Pokedex button (icon sprite)
        const pokedexBtn = this.add.image(width - 20, 52, 'pokedex-icon');
        pokedexBtn.setOrigin(1, 0.5);
        pokedexBtn.setScale(0.5); // 128px * 0.5 = 64px
        pokedexBtn.setInteractive({ useHandCursor: true });

        pokedexBtn.on('pointerdown', () => {
            // Use HTML overlay Pokedex instead of scene
            window.showPokedex();
        });

        // DEBUG: Press 'P' to test particle effect
        this.input.keyboard.on('keydown-P', () => {
            console.log('Testing particle effect...');

            // Create star-shaped particle texture
            if (!this.textures.exists('star')) {
                console.log('Creating star texture...');
                const particleGraphics = this.add.graphics();
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
                    const x = 12 + radius * Math.sin(angle);
                    const y = 12 - radius * Math.cos(angle);
                    if (i === 0) {
                        particleGraphics.moveTo(x, y);
                    } else {
                        particleGraphics.lineTo(x, y);
                    }
                }
                particleGraphics.closePath();
                particleGraphics.fillPath();
                particleGraphics.strokePath();

                particleGraphics.generateTexture('star', 24, 24);
                particleGraphics.destroy();
                console.log('Star texture created');
            }

            console.log('Creating test particles at center...');
            const particles = this.add.particles(width / 2, height / 2, 'star', {
                speed: { min: 200, max: 400 },
                angle: { min: 0, max: 360 },
                scale: { start: 3, end: 0 },
                lifespan: 2000,
                tint: [0xFFFF00, 0xFFD700, 0xFFA500],
                emitting: false
            });

            console.log('Exploding particles...');
            particles.explode(100);

            this.time.delayedCall(3000, () => {
                console.log('Destroying particles...');
                particles.destroy();
            });
        });

        // Start first encounter
        this.startNewEncounter();
    }

    startNewEncounter(forceNewPokemon = false) {
        // Reset attempts
        this.attemptsLeft = 3;

        // Clean up previous Pokemon sprite and its tweens
        if (this.currentPokemonSprite) {
            this.tweens.killTweensOf(this.currentPokemonSprite);
            this.currentPokemonSprite.destroy();
            this.currentPokemonSprite = null;
        }

        // Clean up answer mode UI
        if (this.answerMode) {
            this.answerMode.cleanup(this);
        }

        // Clear previous UI
        this.children.list.forEach(child => {
            if (child.getData && child.getData('clearOnNewEncounter')) {
                child.destroy();
            }
        });

        // Check if player has pokeballs before starting encounter
        if (!hasPokeballs()) {
            // No pokeballs! Show message immediately
            this.showNoPokeballsPopup();
            return;
        }

        // Check if we should use existing Pokemon or spawn new one
        if (!forceNewPokemon && this.registry.get('currentPokemon')) {
            // Restore previous Pokemon from registry
            this.currentPokemon = this.registry.get('currentPokemon');
            console.log('Restoring previous Pokemon:', this.currentPokemon.name);
        } else {
            // Spawn new random Pokemon
            this.spawnPokemon();
            // Save to registry
            this.registry.set('currentPokemon', this.currentPokemon);
        }

        // Display the Pokemon sprite
        this.displayPokemon();

        // Load config if needed, then generate challenge
        if (this.answerMode.loadConfig && !this.answerMode.configLoaded) {
            this.answerMode.loadConfig().then(() => {
                this.answerMode.generateChallenge(this.currentPokemon);
                this.answerMode.createChallengeUI(this, this.attemptsLeft);
            });
        } else {
            // Generate challenge using answer mode
            this.answerMode.generateChallenge(this.currentPokemon);

            // Create UI using answer mode
            this.answerMode.createChallengeUI(this, this.attemptsLeft);
        }
    }

    spawnPokemon() {
        // Tutorial system: First 3 encounters are always Onix, Zubat, Seel (100% catch rate)
        const caughtList = this.registry.get('caughtPokemon') || [];
        const tutorialPokemonIds = [95, 41, 86]; // Onix, Zubat, Seel - names with similar upper/lowercase letters

        let selectedPokemon;
        if (caughtList.length < 3) {
            // Tutorial mode: spawn specific Pokemon in order
            const tutorialIndex = caughtList.length;
            const tutorialId = tutorialPokemonIds[tutorialIndex];
            selectedPokemon = POKEMON_DATA.find(p => p.id === tutorialId);
            this.isTutorialCatch = true;
            console.log(`Tutorial mode: Spawning ${selectedPokemon.name} (${tutorialIndex + 1}/3)`);
        } else {
            // Normal mode: random Pokemon from UNCAUGHT ones only
            const caughtIds = new Set(caughtList.map(p => p.id || p));
            const uncaughtPokemon = POKEMON_DATA.filter(p => !caughtIds.has(p.id));

            if (uncaughtPokemon.length > 0) {
                // Select from uncaught Pokemon
                selectedPokemon = Phaser.Utils.Array.GetRandom(uncaughtPokemon);
                console.log(`Spawning uncaught Pokemon: ${selectedPokemon.name} (${uncaughtPokemon.length} uncaught remaining)`);
            } else {
                // All Pokemon caught! Allow any Pokemon to spawn
                selectedPokemon = Phaser.Utils.Array.GetRandom(POKEMON_DATA);
                console.log(`All Pokemon caught! Spawning ${selectedPokemon.name} (repeat)`);
            }
            this.isTutorialCatch = false;
        }

        this.currentPokemon = {
            id: selectedPokemon.id,
            name: selectedPokemon.name
        };
    }

    displayPokemon() {
        const width = this.cameras.main.width;

        // Create Pokemon sprite
        this.currentPokemonSprite = this.add.image(width / 2, 250, `pokemon_${this.currentPokemon.id}`);
        this.currentPokemonSprite.setScale(0.5);
        this.currentPokemonSprite.setData('clearOnNewEncounter', true);

        // Show rarity indicator (skip for tutorial Pokemon to keep it simple)
        if (!this.isTutorialCatch) {
            const selectedPokemon = POKEMON_DATA.find(p => p.id === this.currentPokemon.id);
            const rarityInfo = getRarityInfo(selectedPokemon);
            if (rarityInfo.icon) {
                this.rarityIndicator = this.add.text(width / 2, 150, rarityInfo.icon, {
                    fontSize: '48px'
                }).setOrigin(0.5);
                this.rarityIndicator.setData('clearOnNewEncounter', true);
            }
        }

        // Re-roll button (positioned to the right of Pokemon)
        const rerollBtn = this.add.text(width / 2 + 200, 250, '🎲', {
            fontSize: '64px'
        }).setOrigin(0.5);
        rerollBtn.setInteractive({ useHandCursor: true });
        rerollBtn.setData('clearOnNewEncounter', true);

        // Re-roll cost indicator (below button)
        const rerollCost = this.add.text(width / 2 + 200, 315, '5', {
            fontSize: '24px',
            fontFamily: 'Arial',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        rerollCost.setData('clearOnNewEncounter', true);

        // Coin icon for re-roll cost
        const rerollCoinIcon = this.add.image(width / 2 + 225, 315, 'coin-tiny');
        rerollCoinIcon.setOrigin(0, 0.5);
        rerollCoinIcon.setScale(0.6);
        rerollCoinIcon.setData('clearOnNewEncounter', true);

        rerollBtn.on('pointerover', () => {
            rerollBtn.setScale(1.1);
        });

        rerollBtn.on('pointerout', () => {
            rerollBtn.setScale(1.0);
        });

        rerollBtn.on('pointerdown', () => {
            const currentCoins = getCoinCount();

            if (currentCoins >= 5) {
                // Deduct 5 coins
                deductCoins(5);

                // Update inventory HUD immediately to show coin deduction
                updateInventoryHUD(this.inventoryHUD);

                // Force new Pokemon spawn
                this.startNewEncounter(true);
            } else {
                // Not enough coins - show feedback
                rerollBtn.setTint(0xFF0000);
                this.time.delayedCall(300, () => {
                    rerollBtn.clearTint();
                });
            }
        });

        // Bounce animation for Pokemon
        this.tweens.add({
            targets: this.currentPokemonSprite,
            y: 270,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    createPokeball(x, y) {
        // Map pokeball type names to sprite keys
        const spriteMap = {
            'pokeball': 'pokeball_poke-ball',
            'greatball': 'pokeball_great-ball',
            'ultraball': 'pokeball_ultra-ball',
            'legendaryball': 'pokeball_legendary-ball'
        };

        const spriteKey = spriteMap[this.selectedPokeballType] || 'pokeball_poke-ball';
        const pokeball = this.add.image(x, y, spriteKey);
        pokeball.setScale(1.2); // 128px * 1.2 = 154px
        pokeball.setDepth(this.DEPTH.POKEBALL);

        return pokeball;
    }

    handleAnswer(isCorrect) {
        if (this.isAnimating) return;

        if (!isCorrect) {
            // Wrong answer - just lose a life and update UI
            this.attemptsLeft--;

            // Check if out of lives
            if (this.attemptsLeft <= 0) {
                // Pokemon runs away
                this.isAnimating = true;
                this.pokemonRunsAway();
            } else {
                // Still have lives - update UI and continue
                this.answerMode.updateUI(this, this.attemptsLeft, this.answerMode.getUsedData());
            }
        } else {
            // Correct answer and all letters collected - check if player has pokeballs!
            if (!hasPokeballs()) {
                // No pokeballs! Show message
                this.showNoPokeballsPopup();
                return;
            }

            // Show pokeball selector
            this.isAnimating = true; // Prevent other actions during selection
            showPokeballSelector(
                this,
                (selectedType) => {
                    // Player selected a pokeball
                    this.selectedPokeballType = selectedType;

                    // Deduct pokeball from inventory
                    removePokeball(this.selectedPokeballType);

                    // Update HUD display
                    updateInventoryHUD(this.inventoryHUD);

                    // Throw pokeball to catch Pokemon!
                    this.throwPokeball(isCorrect);
                },
                () => {
                    // Player cancelled - allow them to continue playing
                    this.isAnimating = false;
                }
            );
        }
    }

    throwPokeball(isCorrect) {
        const width = this.cameras.main.width;
        const pokemonY = this.currentPokemonSprite.y;

        // Stop Pokemon bounce animation
        this.tweens.killTweensOf(this.currentPokemonSprite);

        // Create pokeball at bottom of screen
        const pokeball = this.createPokeball(width / 2, this.cameras.main.height - 100);

        // Throw animation - arc trajectory (faster)
        this.tweens.add({
            targets: pokeball,
            y: pokemonY,
            duration: this.ANIMATION.POKEBALL_THROW_DURATION,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // Hide Pokemon once pokeball reaches it
                this.currentPokemonSprite.setVisible(false);

                // Determine catch success based on probability
                const currentPokemon = POKEMON_DATA.find(p => p.id === this.currentPokemon.id);
                const pokeballData = POKEBALL_TYPES[this.selectedPokeballType];
                const catchSucceeded = attemptCatch(currentPokemon, pokeballData.catchRate, this.isTutorialCatch, this.selectedPokeballType);

                // Start wiggle animation
                this.wigglePokeball(pokeball, catchSucceeded);
            }
        });

        // Rotation during throw
        this.tweens.add({
            targets: pokeball,
            angle: 720,
            duration: this.ANIMATION.POKEBALL_THROW_DURATION,
            ease: 'Linear'
        });
    }

    wigglePokeball(pokeball, isCorrect) {
        let wiggleCount = 0;
        const maxWiggles = this.ANIMATION.POKEBALL_WIGGLE_COUNT;
        const initialAngle = this.ANIMATION.POKEBALL_WIGGLE_INITIAL_ANGLE; // Starting wiggle intensity

        const wiggle = () => {
            // Decrease intensity with each wiggle
            const wiggleIntensity = initialAngle * (1 - wiggleCount / maxWiggles);

            // Wiggle animation with decreasing intensity
            this.tweens.add({
                targets: pokeball,
                angle: `-=${wiggleIntensity}`,
                duration: 100,
                yoyo: true,
                repeat: 1,
                onComplete: () => {
                    wiggleCount++;
                    if (wiggleCount < maxWiggles) {
                        // Continue wiggling
                        this.time.delayedCall(200, wiggle);
                    } else {
                        // Finished wiggling
                        if (isCorrect) {
                            this.catchSuccess(pokeball);
                        } else {
                            this.catchFailed(pokeball);
                        }
                    }
                }
            });
        };

        wiggle();
    }

    catchSuccess(pokeball) {
        const originalY = pokeball.y;

        // More distinct bounce animation (down then up)
        this.tweens.add({
            targets: pokeball,
            y: originalY + 30,
            duration: 200,
            ease: 'Quad.easeIn',
            onComplete: () => {
                // Bounce back up
                this.tweens.add({
                    targets: pokeball,
                    y: originalY - 20,
                    duration: 200,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // Settle back to original position
                        this.tweens.add({
                            targets: pokeball,
                            y: originalY,
                            duration: 150,
                            ease: 'Bounce.easeOut',
                            onComplete: () => {
                                // After bounce, show particles
                                this.showSuccessParticles(pokeball);
                            }
                        });
                    }
                });
            }
        });

        // Save to caught Pokemon (with type data)
        this.saveCaughtPokemon();
    }

    showSuccessParticles(pokeball) {
        console.log('showSuccessParticles called!', 'pokeball position:', pokeball.x, pokeball.y);

        // Create star-shaped particle texture if it doesn't exist
        if (!this.textures.exists('star')) {
            console.log('Creating star texture in showSuccessParticles');
            const particleGraphics = this.add.graphics();
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
                const x = 12 + radius * Math.sin(angle);
                const y = 12 - radius * Math.cos(angle);
                if (i === 0) {
                    particleGraphics.moveTo(x, y);
                } else {
                    particleGraphics.lineTo(x, y);
                }
            }
            particleGraphics.closePath();
            particleGraphics.fillPath();
            particleGraphics.strokePath();

            particleGraphics.generateTexture('star', 24, 24);
            particleGraphics.destroy();
        }

        // More intense yellow star particles with multiple bursts (behind pokeball)
        const particles = this.add.particles(pokeball.x, pokeball.y, 'star', {
            speed: { min: 200, max: 400 },
            angle: { min: 0, max: 360 },
            scale: { start: 2.5, end: 0 },
            blendMode: 'ADD',
            lifespan: 1000,
            tint: [0xFFFF00, 0xFFD700, 0xFFA500],
            emitting: false
        });

        console.log('Particles created, setting depth and exploding');

        // Particles behind pokeball (but in front of background)
        particles.setDepth(this.DEPTH.PARTICLES);
        pokeball.setDepth(this.DEPTH.POKEBALL);

        particles.explode(this.ANIMATION.PARTICLE_BURST_COUNT[0]);

        // Second burst after a short delay
        this.time.delayedCall(this.ANIMATION.PARTICLE_BURST_DELAYS[1], () => {
            console.log('Second burst');
            particles.explode(this.ANIMATION.PARTICLE_BURST_COUNT[1]);
        });

        // Third burst for extra intensity
        this.time.delayedCall(this.ANIMATION.PARTICLE_BURST_DELAYS[2], () => {
            console.log('Third burst');
            particles.explode(this.ANIMATION.PARTICLE_BURST_COUNT[2]);
        });

        // Wait then show info popup
        this.time.delayedCall(this.ANIMATION.SUCCESS_POPUP_DELAY, () => {
            console.log('Destroying particles and showing popup');
            particles.destroy();
            pokeball.destroy();

            // Show HTML popup instead of canvas popup
            window.showPokemonCaughtPopup(this.currentPokemon.id, () => {
                this.isAnimating = false;
                this.startNewEncounter();
            });
        });
    }

    showNoPokeballsPopup() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Store popup elements so we can check and remove them later
        this.noPokeballsPopupElements = [];

        // Create popup background
        const popupWidth = 400;
        const popupHeight = 400;
        const popup = this.add.rectangle(width / 2, height / 2, popupWidth, popupHeight, 0xFFFFFF);
        popup.setStrokeStyle(4, 0x000000);
        popup.setDepth(this.DEPTH.POPUP_BACKGROUND);
        this.noPokeballsPopupElements.push(popup);

        // Warning triangle at top
        const warningEmoji = this.add.text(width / 2, height / 2 - 120, '⚠️', {
            fontSize: '80px'
        }).setOrigin(0.5);
        warningEmoji.setDepth(this.DEPTH.POPUP_CONTENT);
        this.noPokeballsPopupElements.push(warningEmoji);

        // Show pokeball sprite and 0 side by side
        const pokeballSprite = this.add.image(width / 2 - 80, height / 2 - 10, 'pokeball_poke-ball');
        pokeballSprite.setScale(0.5);
        pokeballSprite.setDepth(this.DEPTH.POPUP_CONTENT);
        this.noPokeballsPopupElements.push(pokeballSprite);

        // Big red 0 next to pokeball
        const zeroText = this.add.text(width / 2 + 40, height / 2 - 10, '0', {
            font: 'bold 120px Arial',
            fill: '#E74C3C'
        }).setOrigin(0.5);
        zeroText.setDepth(this.DEPTH.POPUP_CONTENT);
        this.noPokeballsPopupElements.push(zeroText);

        // Dice button (only option - centered)
        const gameBtn = this.add.rectangle(width / 2, height / 2 + 150, 200, 80, 0x4CAF50);
        gameBtn.setStrokeStyle(4, 0x000000);
        gameBtn.setInteractive({ useHandCursor: true });
        gameBtn.setDepth(this.DEPTH.POPUP_CONTENT);
        this.noPokeballsPopupElements.push(gameBtn);

        // Use dice icon sprite instead of emoji
        const diceIcon = this.add.image(width / 2, height / 2 + 150, 'dice-icon');
        diceIcon.setScale(0.4); // Scale down the 128px icon
        diceIcon.setDepth(this.DEPTH.POPUP_BUTTON_TEXT);
        this.noPokeballsPopupElements.push(diceIcon);

        gameBtn.on('pointerover', () => {
            gameBtn.setFillStyle(0x66BB6A);
            gameBtn.setScale(1.05);
        });

        gameBtn.on('pointerout', () => {
            gameBtn.setFillStyle(0x4CAF50);
            gameBtn.setScale(1.0);
        });

        gameBtn.on('pointerdown', () => {
            // Clean up popup
            this.noPokeballsPopupElements.forEach(el => el.destroy());
            this.noPokeballsPopupElements = null;

            // Go to pokeball game
            this.scene.start('PokeballGameScene');
        });
    }

    update() {
        // Check if the "no pokeballs" popup is showing
        if (this.noPokeballsPopupElements && this.noPokeballsPopupElements.length > 0) {
            // Check if player now has pokeballs (they bought some from the store)
            if (hasPokeballs()) {
                // Clean up popup
                this.noPokeballsPopupElements.forEach(el => {
                    if (el && el.destroy) {
                        el.destroy();
                    }
                });
                this.noPokeballsPopupElements = null;

                // Start a new encounter since they now have pokeballs
                this.startNewEncounter();
            }
        }
    }

    showPokemonInfoPopup(pokeball) {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Get Pokemon details from local POKEMON_DATA
        const data = POKEMON_DATA.find(p => p.id === this.currentPokemon.id);
        if (!data) {
            console.error('Pokemon data not found for ID:', this.currentPokemon.id);
            this.isAnimating = false;
            this.startNewEncounter();
            return;
        }

        // Create semi-transparent background overlay
        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
        overlay.setInteractive();
        overlay.setDepth(this.DEPTH.POPUP_OVERLAY);

        // Create popup background (taller to fit image)
        const popupWidth = 450;
        const popupHeight = 450;
        const popup = this.add.rectangle(width / 2, height / 2, popupWidth, popupHeight, 0xFFFFFF);
        popup.setStrokeStyle(4, 0x000000);
        popup.setDepth(this.DEPTH.POPUP_BACKGROUND);

        // Pokemon image
        const pokemonImage = this.add.image(width / 2, height / 2 - 120, `pokemon_${this.currentPokemon.id}`);
        pokemonImage.setScale(0.4);
        pokemonImage.setDepth(this.DEPTH.POPUP_CONTENT);

        // Pokemon number
        const numberText = this.add.text(width / 2, height / 2 + 10, `#${String(data.id).padStart(3, '0')}`, {
            font: 'bold 24px Arial',
            fill: '#666666'
        }).setOrigin(0.5);
        numberText.setDepth(this.DEPTH.POPUP_CONTENT);

        // Pokemon name
        const nameText = this.add.text(width / 2 - 30, height / 2 + 45, data.name.toUpperCase(), {
            font: 'bold 32px Arial',
            fill: '#000000'
        }).setOrigin(0.5);
        nameText.setDepth(this.DEPTH.POPUP_CONTENT);

        // Speaker button to play Pokemon name audio
        const speakerBtn = this.add.text(width / 2 + 80, height / 2 + 45, '🔊', {
            font: '36px Arial',
            padding: { y: 7 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        speakerBtn.setDepth(this.DEPTH.POPUP_CONTENT);

        // Hover effects for speaker
        speakerBtn.on('pointerover', () => {
            speakerBtn.setScale(1.2);
        });

        speakerBtn.on('pointerout', () => {
            speakerBtn.setScale(1.0);
        });

        // Play audio on click
        speakerBtn.on('pointerdown', () => {
            speakerBtn.setScale(0.9);
            this.time.delayedCall(100, () => {
                speakerBtn.setScale(1.0);
            });

            // Play Pokemon name audio
            const audioKey = `pokemon_audio_${data.id}`;
            this.sound.play(audioKey);
        });

        // Pokemon types - display type icons (circular icons are smaller, so scale more)
        const typeIconSize = 100;
        const typeSpacing = 15;
        const numTypes = data.types.length;
        const totalTypeWidth = numTypes * typeIconSize + (numTypes - 1) * typeSpacing;
        const startX = (width - totalTypeWidth) / 2 + typeIconSize / 2;
        const typeY = height / 2 + 85;

        const typeIcons = [];
        data.types.forEach((typeId, index) => {
            const x = startX + index * (typeIconSize + typeSpacing);

            // Type icon (circular icons need more scaling since they're 60x40 instead of 200x40)
            const typeIcon = this.add.image(x, typeY, `type_${typeId}`);
            typeIcon.setScale(3.5); // Increased scale for circular icons
            typeIcon.setDepth(this.DEPTH.POPUP_CONTENT);
            typeIcons.push(typeIcon);
        });

        // Height and Weight
        const statsText = this.add.text(width / 2, height / 2 + 120, `Height: ${data.height / 10}m  |  Weight: ${data.weight / 10}kg`, {
            font: '18px Arial',
            fill: '#666666'
        }).setOrigin(0.5);
        statsText.setDepth(this.DEPTH.POPUP_CONTENT);

        // Continue button
        const continueBtn = this.add.rectangle(width / 2, height / 2 + 170, 150, 40, 0x4CAF50);
        continueBtn.setStrokeStyle(2, 0x000000);
        continueBtn.setInteractive({ useHandCursor: true });
        continueBtn.setDepth(this.DEPTH.POPUP_CONTENT);

        const continueText = this.add.text(width / 2, height / 2 + 170, 'CONTINUE', {
            font: 'bold 18px Arial',
            fill: '#FFFFFF'
        }).setOrigin(0.5);
        continueText.setDepth(this.DEPTH.POPUP_BUTTON_TEXT);

        continueBtn.on('pointerover', () => {
            continueBtn.setFillStyle(0x66BB6A);
        });

        continueBtn.on('pointerout', () => {
            continueBtn.setFillStyle(0x4CAF50);
        });

        continueBtn.on('pointerdown', () => {
            // Clean up popup
            overlay.destroy();
            popup.destroy();
            pokemonImage.destroy();
            numberText.destroy();
            nameText.destroy();
            speakerBtn.destroy();
            typeIcons.forEach(icon => icon.destroy());
            statsText.destroy();
            continueBtn.destroy();
            continueText.destroy();
            pokeball.destroy();

            this.isAnimating = false;
            this.startNewEncounter();
        });
    }

    catchFailed(pokeball) {
        // DRAMATIC BREAK-FREE ANIMATION

        // Step 1: Violent shaking (much more intense than wiggle)
        let shakeCount = 0;
        const maxShakes = 4;

        const violentShake = () => {
            // Flash red to show Pokemon is breaking free
            pokeball.setTint(0xFF0000);

            // Violent shake with large angle
            this.tweens.add({
                targets: pokeball,
                angle: `+=${30 * (shakeCount % 2 === 0 ? 1 : -1)}`,
                scale: 1.3,
                duration: 80,
                yoyo: true,
                repeat: 1,
                onComplete: () => {
                    pokeball.clearTint();
                    shakeCount++;

                    if (shakeCount < maxShakes) {
                        this.time.delayedCall(50, violentShake);
                    } else {
                        // Step 2: POKEBALL BREAKS OPEN!
                        this.pokeballBreakOpen(pokeball);
                    }
                }
            });
        };

        violentShake();
    }

    pokeballBreakOpen(pokeball) {
        const pokeballX = pokeball.x;
        const pokeballY = pokeball.y;

        // Create explosion particle burst
        const explosionParticles = this.add.particles(pokeballX, pokeballY, 'star', {
            speed: { min: 200, max: 400 },
            angle: { min: 0, max: 360 },
            scale: { start: 2, end: 0 },
            lifespan: 600,
            tint: [0xFF6B6B, 0xFF8E53, 0xFFD93D],
            quantity: 40
        });
        explosionParticles.setDepth(100);
        explosionParticles.explode();

        // Make pokeball "explode" apart
        this.tweens.add({
            targets: pokeball,
            scale: 1.8,
            alpha: 0,
            duration: 300,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                pokeball.destroy();
                explosionParticles.destroy();

                // Step 3: Pokemon dramatic re-entry
                this.pokemonDramaticReturn(pokeballX, pokeballY);
            }
        });
    }

    pokemonDramaticReturn(x, y) {
        // Flash of light at pokeball position
        const flash = this.add.circle(x, y, 100, 0xFFFFFF, 0.8);
        flash.setDepth(99);

        this.tweens.add({
            targets: flash,
            scale: 3,
            alpha: 0,
            duration: 400,
            onComplete: () => flash.destroy()
        });

        // Show Pokemon with dramatic entrance
        this.currentPokemonSprite.setVisible(true);
        this.currentPokemonSprite.setScale(0);
        this.currentPokemonSprite.setAlpha(1);

        // Scale up with elastic bounce
        this.tweens.add({
            targets: this.currentPokemonSprite,
            scale: 0.6, // Slightly bigger for impact
            duration: 500,
            ease: 'Elastic.easeOut',
            onComplete: () => {
                // Settle to normal size
                this.tweens.add({
                    targets: this.currentPokemonSprite,
                    scale: 0.5,
                    duration: 200,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // Triumphant particle burst around Pokemon
                        const triumphParticles = this.add.particles(this.currentPokemonSprite.x, this.currentPokemonSprite.y, 'star', {
                            speed: { min: 100, max: 200 },
                            angle: { min: 0, max: 360 },
                            scale: { start: 1.5, end: 0 },
                            lifespan: 800,
                            tint: [0xFFFF00, 0xFFD700, 0xFFA500],
                            quantity: 25
                        });
                        triumphParticles.setDepth(100);
                        triumphParticles.explode();

                        this.time.delayedCall(600, () => triumphParticles.destroy());

                        // Pokemon broke free! Reset the letter challenge
                        this.answerMode.cleanup(this);

                        // Reset attempts
                        this.attemptsLeft = this.MAX_ATTEMPTS;

                        // Resume bounce animation
                        this.tweens.add({
                            targets: this.currentPokemonSprite,
                            y: 270,
                            duration: 1000,
                            yoyo: true,
                            repeat: -1,
                            ease: 'Sine.easeInOut'
                        });

                        // Generate new challenge for same Pokemon
                        this.answerMode.generateChallenge(this.currentPokemon);
                        this.answerMode.createChallengeUI(this, this.attemptsLeft);

                        this.isAnimating = false;
                    }
                });
            }
        });
    }

    pokemonRunsAway() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const pokemonX = this.currentPokemonSprite.x;
        const pokemonY = this.currentPokemonSprite.y;

        // Create dust cloud texture if not already created
        if (!this.textures.exists('dustCloud')) {
            const dustGraphics = this.add.graphics();

            // Create irregular, cloud-like dust particle
            // Draw multiple overlapping circles for organic look
            dustGraphics.fillStyle(0xFFFFFF, 0.8);
            dustGraphics.fillCircle(16, 16, 10);

            dustGraphics.fillStyle(0xFFFFFF, 0.6);
            dustGraphics.fillCircle(12, 18, 8);
            dustGraphics.fillCircle(20, 14, 7);

            dustGraphics.fillStyle(0xFFFFFF, 0.4);
            dustGraphics.fillCircle(10, 14, 6);
            dustGraphics.fillCircle(22, 18, 6);
            dustGraphics.fillCircle(16, 22, 5);

            dustGraphics.generateTexture('dustCloud', 32, 32);
            dustGraphics.destroy();
        }

        // Layer 1: Large, slow background dust clouds
        const largeDust = this.add.particles(pokemonX, pokemonY + 20, 'dustCloud', {
            speed: { min: 30, max: 80 },
            angle: { min: 170, max: 370 }, // Mostly horizontal spread
            scale: { start: 3.5, end: 5 },
            alpha: { start: 0.4, end: 0 },
            lifespan: 1200,
            gravityY: 80,
            rotate: { start: 0, end: 180 },
            tint: [0xD4A574, 0xC8997A], // Brownish earth tones
            emitting: false
        });

        // Layer 2: Medium particles with more speed
        const mediumDust = this.add.particles(pokemonX, pokemonY + 10, 'dustCloud', {
            speed: { min: 60, max: 120 },
            angle: { min: 160, max: 380 },
            scale: { start: 2, end: 3.5 },
            alpha: { start: 0.5, end: 0 },
            lifespan: 1000,
            gravityY: 100,
            rotate: { start: 0, end: 360 },
            tint: [0xE0C097, 0xD4A574, 0xC8997A],
            emitting: false
        });

        // Layer 3: Small, fast detail particles
        const smallDust = this.add.particles(pokemonX, pokemonY, 'dustCloud', {
            speed: { min: 80, max: 150 },
            angle: { min: 150, max: 390 },
            scale: { start: 1, end: 2 },
            alpha: { start: 0.6, end: 0 },
            lifespan: 800,
            gravityY: 120,
            rotate: { start: 0, end: 360 },
            tint: [0xB8936A, 0xC8997A, 0xE0C097],
            emitting: false
        });

        // Initial explosive burst
        largeDust.explode(15);
        mediumDust.explode(25);
        smallDust.explode(35);

        // Continue emitting for a brief period (creates the "cloud" effect)
        this.time.delayedCall(50, () => {
            largeDust.emitting = true;
            mediumDust.emitting = true;
            smallDust.emitting = true;
            largeDust.setFrequency(80);
            mediumDust.setFrequency(60);
            smallDust.setFrequency(40);
        });

        // Stop emission after cloud forms
        this.time.delayedCall(450, () => {
            largeDust.stop();
            mediumDust.stop();
            smallDust.stop();
        });

        // Fade out and move Pokemon
        this.tweens.add({
            targets: this.currentPokemonSprite,
            alpha: 0,
            y: pokemonY - 50,
            duration: 800,
            ease: 'Power2'
        });

        // Continue after delay and cleanup
        this.time.delayedCall(1500, () => {
            largeDust.destroy();
            mediumDust.destroy();
            smallDust.destroy();
            this.isAnimating = false;

            // Clear current Pokemon from registry so next encounter generates a new one
            this.registry.remove('currentPokemon');

            this.startNewEncounter();
        });
    }

    saveCaughtPokemon() {
        const caughtList = this.registry.get('caughtPokemon') || [];

        // Check if already caught
        if (!caughtList.find(p => p.id === this.currentPokemon.id)) {
            // Save without types - they come from POKEMON_DATA
            caughtList.push({
                id: this.currentPokemon.id,
                name: this.currentPokemon.name,
                caughtDate: new Date().toISOString()
            });

            this.registry.set('caughtPokemon', caughtList);
            localStorage.setItem('pokemonCaughtList', JSON.stringify(caughtList));
        }

        // Clear current Pokemon from registry so next encounter generates a new one
        this.registry.remove('currentPokemon');
    }
}
