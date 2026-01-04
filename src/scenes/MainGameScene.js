import Phaser from 'phaser';
import { LetterMatchMode } from '../answerModes/LetterMatchMode.js';
import { DebugMode } from '../answerModes/DebugMode.js';
import { createInventoryHUD, updateInventoryHUD } from '../inventoryHUD.js';
import { hasPokeballs, removePokeball, getInventory, POKEBALL_TYPES } from '../inventory.js';
import { showPokeballSelector } from '../pokeballSelector.js';

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
            // Configure letter match mode: lowercase name, uppercase alphabet
            this.answerMode = new LetterMatchMode({
                nameCase: 'lowercase',
                alphabetCase: 'uppercase'
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

    startNewEncounter() {
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

        // Spawn random Pokemon
        this.spawnPokemon();

        // Generate challenge using answer mode
        this.answerMode.generateChallenge(this.currentPokemon);

        // Create UI using answer mode
        this.answerMode.createChallengeUI(this, this.attemptsLeft);
    }

    spawnPokemon() {
        const width = this.cameras.main.width;

        // Pick a random Pokemon from all 100
        const randomPokemon = Phaser.Utils.Array.GetRandom(POKEMON_DATA);

        this.currentPokemon = {
            id: randomPokemon.id,
            name: randomPokemon.name
        };

        // Create Pokemon sprite
        this.currentPokemonSprite = this.add.image(width / 2, 250, `pokemon_${randomPokemon.id}`);
        this.currentPokemonSprite.setScale(0.5);
        this.currentPokemonSprite.setData('clearOnNewEncounter', true);

        // Bounce animation
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
        // Use sprite for the selected pokeball type
        const spriteKey = `pokeball_${this.selectedPokeballType}`;
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
                // Start wiggle animation
                this.wigglePokeball(pokeball, isCorrect);
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

        // Create semi-transparent background overlay
        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
        overlay.setInteractive();
        overlay.setDepth(this.DEPTH.POPUP_OVERLAY);

        // Create popup background
        const popupWidth = 500;
        const popupHeight = 300;
        const popup = this.add.rectangle(width / 2, height / 2, popupWidth, popupHeight, 0xFFFFFF);
        popup.setStrokeStyle(4, 0x000000);
        popup.setDepth(this.DEPTH.POPUP_BACKGROUND);

        // Title text
        const titleText = this.add.text(width / 2, height / 2 - 80, 'Inga Pokébollar!', {
            font: 'bold 42px Arial',
            fill: '#E74C3C'
        }).setOrigin(0.5);
        titleText.setDepth(this.DEPTH.POPUP_CONTENT);

        // Message text
        const messageText = this.add.text(width / 2, height / 2 - 20, 'Du behöver Pokébollar för att fånga Pokemon!\nSpela Pokéball-spelet för att tjäna fler!', {
            font: '20px Arial',
            fill: '#000000',
            align: 'center'
        }).setOrigin(0.5);
        messageText.setDepth(this.DEPTH.POPUP_CONTENT);

        // Go to Pokeball Game button
        const gameBtn = this.add.rectangle(width / 2 - 90, height / 2 + 80, 160, 50, 0x4CAF50);
        gameBtn.setStrokeStyle(3, 0x000000);
        gameBtn.setInteractive({ useHandCursor: true });
        gameBtn.setDepth(this.DEPTH.POPUP_CONTENT);

        const gameBtnText = this.add.text(width / 2 - 90, height / 2 + 80, 'Spela Spel', {
            font: 'bold 20px Arial',
            fill: '#FFFFFF'
        }).setOrigin(0.5);
        gameBtnText.setDepth(this.DEPTH.POPUP_BUTTON_TEXT);

        gameBtn.on('pointerover', () => {
            gameBtn.setFillStyle(0x66BB6A);
        });

        gameBtn.on('pointerout', () => {
            gameBtn.setFillStyle(0x4CAF50);
        });

        gameBtn.on('pointerdown', () => {
            // Clean up popup
            overlay.destroy();
            popup.destroy();
            titleText.destroy();
            messageText.destroy();
            gameBtn.destroy();
            gameBtnText.destroy();
            cancelBtn.destroy();
            cancelBtnText.destroy();

            // Go to pokeball game
            this.scene.start('PokeballGameScene');
        });

        // Cancel button
        const cancelBtn = this.add.rectangle(width / 2 + 90, height / 2 + 80, 160, 50, 0xE74C3C);
        cancelBtn.setStrokeStyle(3, 0x000000);
        cancelBtn.setInteractive({ useHandCursor: true });
        cancelBtn.setDepth(this.DEPTH.POPUP_CONTENT);

        const cancelBtnText = this.add.text(width / 2 + 90, height / 2 + 80, 'Avbryt', {
            font: 'bold 20px Arial',
            fill: '#FFFFFF'
        }).setOrigin(0.5);
        cancelBtnText.setDepth(this.DEPTH.POPUP_BUTTON_TEXT);

        cancelBtn.on('pointerover', () => {
            cancelBtn.setFillStyle(0xC0392B);
        });

        cancelBtn.on('pointerout', () => {
            cancelBtn.setFillStyle(0xE74C3C);
        });

        cancelBtn.on('pointerdown', () => {
            // Clean up popup
            overlay.destroy();
            popup.destroy();
            titleText.destroy();
            messageText.destroy();
            gameBtn.destroy();
            gameBtnText.destroy();
            cancelBtn.destroy();
            cancelBtnText.destroy();
        });
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
        const nameText = this.add.text(width / 2, height / 2 + 45, data.name.toUpperCase(), {
            font: 'bold 32px Arial',
            fill: '#000000'
        }).setOrigin(0.5);
        nameText.setDepth(this.DEPTH.POPUP_CONTENT);

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
        // Pokeball opens, Pokemon escapes
        this.tweens.add({
            targets: pokeball,
            alpha: 0,
            duration: 300,
            onComplete: () => {
                pokeball.destroy();

                // Show Pokemon again
                this.currentPokemonSprite.setVisible(true);

                // Scale animation for Pokemon appearing
                this.currentPokemonSprite.setScale(0);
                this.tweens.add({
                    targets: this.currentPokemonSprite,
                    scale: 0.5,
                    duration: 400,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        if (this.attemptsLeft <= 0) {
                            // Pokemon runs away with smoke
                            this.pokemonRunsAway();
                        } else {
                            // Resume bounce animation
                            this.tweens.add({
                                targets: this.currentPokemonSprite,
                                y: 270,
                                duration: 1000,
                                yoyo: true,
                                repeat: -1,
                                ease: 'Sine.easeInOut'
                            });

                            // Update UI using answer mode
                            this.answerMode.updateUI(this, this.attemptsLeft, this.answerMode.getUsedData());
                            this.isAnimating = false;
                        }
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
    }
}
