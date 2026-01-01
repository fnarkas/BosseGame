import Phaser from 'phaser';
import { LetterMatchMode } from '../answerModes/LetterMatchMode.js';
import { DebugMode } from '../answerModes/DebugMode.js';

export class MainGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainGameScene' });
        this.currentPokemon = null;
        this.currentPokemonSprite = null;
        this.attemptsLeft = 3;
        this.isAnimating = false; // Prevent multiple clicks during animation
        this.answerMode = null; // Will be set in create() based on game mode

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

        // Pokedex button (emoji only)
        const pokedexBtn = this.add.text(width - 20, 20, '📖', {
            font: '64px Arial',
            fill: '#ffffff'
        }).setOrigin(1, 0).setInteractive();

        pokedexBtn.on('pointerdown', () => {
            this.scene.start('PokedexScene');
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
        // Create a container for the pokeball
        const pokeball = this.add.container(x, y);

        const radius = 140; // Slightly bigger to fully cover Pokemon

        // Bottom half (white)
        const bottomHalf = this.add.circle(0, 0, radius, 0xFFFFFF);
        bottomHalf.setStrokeStyle(9, 0x000000);

        // Top half (red) - using a graphics object to draw a semicircle
        const topHalf = this.add.graphics();
        topHalf.fillStyle(0xFF0000, 1);
        topHalf.lineStyle(9, 0x000000);
        topHalf.slice(0, 0, radius, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        topHalf.fillPath();
        topHalf.strokePath();

        // Middle black line
        const middleLine = this.add.rectangle(0, 0, radius * 2, 18, 0x000000);

        // Center circle (white)
        const centerCircle = this.add.circle(0, 0, 35, 0xFFFFFF);
        centerCircle.setStrokeStyle(9, 0x000000);

        // Center button (small circle)
        const centerButton = this.add.circle(0, 0, 18, 0xCCCCCC);
        centerButton.setStrokeStyle(6, 0x000000);

        pokeball.add([bottomHalf, topHalf, middleLine, centerCircle, centerButton]);

        return pokeball;
    }

    handleAnswer(isCorrect) {
        if (this.isAnimating) return;

        this.isAnimating = true;

        if (!isCorrect) {
            this.attemptsLeft--;
        }

        // Throw pokeball
        this.throwPokeball(isCorrect);
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

        // Save to caught Pokemon
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
            this.showPokemonInfoPopup(pokeball);
        });
    }

    async showPokemonInfoPopup(pokeball) {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Fetch Pokemon details from PokeAPI
        try {
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${this.currentPokemon.id}`);
            const data = await response.json();

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

            // Pokemon types
            const types = data.types.map(t => t.type.name.toUpperCase()).join(' / ');
            const typeText = this.add.text(width / 2, height / 2 + 85, `Type: ${types}`, {
                font: 'bold 20px Arial',
                fill: '#333333'
            }).setOrigin(0.5);
            typeText.setDepth(this.DEPTH.POPUP_CONTENT);

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
                typeText.destroy();
                statsText.destroy();
                continueBtn.destroy();
                continueText.destroy();
                pokeball.destroy();

                this.isAnimating = false;
                this.startNewEncounter();
            });

        } catch (error) {
            console.error('Failed to fetch Pokemon data:', error);
            // If API fails, just continue
            pokeball.destroy();
            this.isAnimating = false;
            this.startNewEncounter();
        }
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

        // Create smoke texture if not already created
        if (!this.textures.exists('smoke')) {
            const smokeGraphics = this.add.graphics();
            smokeGraphics.fillStyle(0xCCCCCC, 1);
            smokeGraphics.fillCircle(0, 0, 8);
            smokeGraphics.generateTexture('smoke', 16, 16);
            smokeGraphics.destroy();
        }

        // Create smoke particles
        const smokeParticles = this.add.particles(pokemonX, pokemonY, 'smoke', {
            speed: { min: 50, max: 100 },
            angle: { min: 0, max: 360 },
            scale: { start: 2, end: 4 },
            alpha: { start: 0.6, end: 0 },
            lifespan: 1000,
            frequency: 50,
            tint: [0xCCCCCC, 0x999999, 0xDDDDDD]
        });

        // Fade out and move Pokemon
        this.tweens.add({
            targets: this.currentPokemonSprite,
            alpha: 0,
            y: pokemonY - 50,
            duration: 800,
            ease: 'Power2',
            onComplete: () => {
                smokeParticles.stop();
            }
        });

        // Continue after delay
        this.time.delayedCall(1500, () => {
            smokeParticles.destroy();
            this.isAnimating = false;
            this.startNewEncounter();
        });
    }

    saveCaughtPokemon() {
        const caughtList = this.registry.get('caughtPokemon') || [];

        // Check if already caught
        if (!caughtList.find(p => p.id === this.currentPokemon.id)) {
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
