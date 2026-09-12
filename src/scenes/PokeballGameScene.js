import Phaser from 'phaser';
import { getMinigameByForced, getMinigameForMode, isLegendaryMode, pickWeightedMinigame } from '../minigameRegistry.js';
import { getCoinCount, addCoins, getRandomCoinReward, COIN_KEY } from '../currency.js';
import { showGiftBoxReward } from '../rewardAnimation.js';
import { getStreak, incrementStreak, resetStreak, getMultiplier, milestoneBonus } from '../streak.js';
import { playChime } from '../sfx.js';
import { createBoosterBar, updateBoosterBar, destroyBoosterBar, hideBoosterBar, showBoosterBar } from '../boosterBar.js';
import { loadModeWeights } from '../minigameWheel.js';
import { refreshWheel } from '../wheelTexture.js';
import { pullChanges, onRemoteChange } from '../account.js';
import { saveActiveMinigame, loadActiveMinigame, clearActiveMinigame } from '../minigameSession.js';
import { ensureAudioPacks } from '../lazyLoad.js';

export class PokeballGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PokeballGameScene' });
        this.gameMode = null;
        this.coinCount = 0;
        this.coinCounterText = null;
        this.isProcessingAnswer = false;
        this.boosterBarElements = null; // Booster bar UI elements
    }

    async create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Load coin count from localStorage
        this.coinCount = getCoinCount();

        // Whatever stops this scene (home button, no-pokeballs flow, a debug
        // route) must tear down the running mode: its timers, tweens, mic
        // session and DOM state would otherwise outlive the scene.
        if (this.events && this.events.once) {
            this.events.once('shutdown', () => this.teardown());
        }

        // Background
        this.add.rectangle(0, 0, width, height, 0x87CEEB).setOrigin(0);

        // Home button (top left): always visible, so the child can leave any
        // minigame and go back to catching Pokemon. Leaving forgets the
        // in-progress game, so a reload afterwards doesn't resume it.
        const homeBtn = this.add.image(70, 50, 'pokeball_poke-ball');
        homeBtn.setScale(0.8);
        homeBtn.setDepth(1002);
        homeBtn.setInteractive({ useHandCursor: true });
        homeBtn.setName('home-button');
        homeBtn.on('pointerover', () => homeBtn.setScale(0.9));
        homeBtn.on('pointerout', () => homeBtn.setScale(0.8));
        homeBtn.on('pointerdown', () => this.goHome());

        // Pokedex button (top left, next to home)
        const pokedexBtn = this.add.text(170, 40, '📖', {
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
            this.scene.pause();
            window.openStore(() => {
                if (this.scene.isPaused && this.scene.isPaused()) this.scene.resume();
                this.coinCount = getCoinCount();
                this.coinCounterText.setText(`${this.coinCount}`);
            });
        });

        // Settings button (gear icon, before store button)
        const settingsBtn = this.add.text(width - 230, 52, '⚙️', {
            fontSize: '48px',
            padding: { x: 10, y: 5 }
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
        settingsBtn.setDepth(1002); // Above overlay

        settingsBtn.on('pointerdown', () => {
            this.scene.pause();
            this.scene.launch('SettingsScene', { previousScene: 'PokeballGameScene' });
        });

        // Hover effect for settings button
        settingsBtn.on('pointerover', () => {
            settingsBtn.setScale(1.1);
        });
        settingsBtn.on('pointerout', () => {
            settingsBtn.setScale(1);
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

        // Coins the parent grants in /admin while the child plays show up
        // without a reload (account.js live sync).
        this.stopRemoteWatch = onRemoteChange((keys) => {
            if (!keys.includes(COIN_KEY) || !this.coinCounterText || !this.coinCounterText.scene) return;
            this.coinCount = getCoinCount();
            this.coinCounterText.setText(`${this.coinCount}`);
        });

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
            // If a minigame is already in progress (e.g. the page was reloaded),
            // resume that exact game instead of rolling a new one. This stops a
            // child from reloading to re-roll until they get the game they want.
            const savedModeName = loadActiveMinigame();
            const restoreEntry = savedModeName ? getMinigameForMode(savedModeName) : null;

            if (restoreEntry) {
                this.gameMode = new restoreEntry.Mode();
                this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                    this.handleAnswer(isCorrect, answer, x, y);
                });

                // Skip the wheel and drop straight back into the game.
                this.loadNextChallenge();
            } else {
                // Fresh round: roll a random mode, remember it, then show the wheel.
                await this.selectGameMode();
                saveActiveMinigame(this.gameMode.constructor.name);

                this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                    this.handleAnswer(isCorrect, answer, x, y);
                });

                // Show dice rolling animation before starting the game
                this.showDiceRollAnimation();
            }
        } else {
            // Debug mode: Initialize game mode and start immediately
            await this.selectGameMode();

            // Set up callback for game mode
            this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                this.handleAnswer(isCorrect, answer, x, y);
            });

            // Start first challenge immediately for debug modes
            this.loadNextChallenge();
        }
    }

    async selectGameMode() {
        // A debug route (e.g. /letters) forces one mode via the registry value
        // 'pokeballGameMode'; otherwise roll a weighted random mode.
        const forcedMode = this.registry.get('pokeballGameMode');
        const forcedEntry = forcedMode ? getMinigameByForced(forcedMode) : null;

        if (forcedMode && !forcedEntry) {
            console.warn(`Unknown forced game mode '${forcedMode}', rolling a random one`);
        }

        const entry = forcedEntry || await this.selectRandomGameMode();
        this.gameMode = new entry.Mode();
        console.log(`Selected game mode: ${entry.name}${forcedEntry ? ' (forced)' : ''}`);
    }

    async selectRandomGameMode() {
        // Pick up probabilities the parent may just have saved in /admin, so
        // the very next spin uses them (the wheel is redrawn to match).
        await pullChanges();
        // Weights (config merged over defaults) come from the shared wheel module,
        // so mode selection and the wheel graphic always agree. Higher weight =
        // higher probability of being selected; weight 0 = never selected.
        const weights = await loadModeWeights();
        return pickWeightedMinigame(weights);
    }

    async showDiceRollAnimation() {
        // The wheel must show the slices the mode was rolled from: redraw it
        // if the probabilities changed since it was last drawn.
        try {
            await refreshWheel(this);
        } catch (error) {
            console.warn('Could not refresh the wheel, using the current one:', error);
        }
        if (this.scene.isActive && !this.scene.isActive()) return;

        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Create semi-transparent overlay
        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
        overlay.setDepth(1000);

        // Create booster bar for wheel scene (above overlay)
        const wheelBoosterBar = createBoosterBar(this, width / 2, 60, 1002);
        const currentStreak = getStreak();
        updateBoosterBar(wheelBoosterBar, currentStreak, this);

        // Map the selected mode to its slice on the wheel. The wheel is built in
        // BootScene from the enabled (weight > 0) slices, so we look up the slice
        // by class name in that same ordered list rather than a fixed map.
        const wheelSlices = this.registry.get('wheelSlices') || [];
        const modeName = this.gameMode.constructor.name;
        let selectedSlice = wheelSlices.findIndex(slice => slice.classNames.includes(modeName)) + 1;
        if (selectedSlice === 0) {
            // Mode isn't on the wheel (e.g. a forced/debug mode whose weight is 0).
            // Land on a random slice so the animation still works.
            selectedSlice = Phaser.Math.Between(1, Math.max(1, wheelSlices.length));
        }

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

            // Start the spinning animation
            this.startWheelSpin(wheelSprite, pointerSprite, selectedSlice, overlay, wheelBoosterBar);
        });
    }

    startWheelSpin(wheelSprite, pointerSprite, selectedSlice, overlay, wheelBoosterBar) {
        // Calculate target rotation.
        // The wheel is generated in BootScene from the enabled slices. Slices are
        // drawn starting at index 0 at the TOP (-90° in canvas coordinates) and
        // proceed clockwise. The pointer is FIXED at the top pointing down.
        // selectedSlice is 1-based, so convert to a 0-based index.
        const wheelSlices = this.registry.get('wheelSlices') || [];
        const sliceCount = Math.max(1, wheelSlices.length);
        const sliceIndex = selectedSlice - 1;
        const sliceAngle = 360 / sliceCount; // Degrees per slice, based on the actual slice count

        // Index 0 is already at top (0° rotation needed).
        // To bring index N to the top, rotate -(N * sliceAngle)°.
        const targetRotation = -sliceIndex * sliceAngle;

        // Add 3-5 full rotations (clockwise, positive degrees) for spinning effect
        const fullRotations = Phaser.Math.Between(3, 5) * 360;

        // Add a random offset within the slice for a natural feel, kept inside the
        // slice bounds so the pointer never lands on a neighbouring slice.
        const maxOffset = Math.floor(sliceAngle * 0.35);
        const randomOffset = Phaser.Math.Between(-maxOffset, maxOffset);

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
        if (isLegendaryMode(this.gameMode)) {
            hideBoosterBar(this.boosterBarElements);
        } else {
            showBoosterBar(this.boosterBarElements);
        }

        // Load the mode's audio pack and config if needed, then generate the
        // challenge. Both are usually instant (cached); the first time a mode
        // is played its audio downloads behind a small spinner.
        const mode = this.gameMode;
        const entry = getMinigameForMode(mode);
        const start = () => {
            // Skip if the scene stopped or moved on while we were loading.
            if (this.gameMode !== mode) return;
            if (this.scene.isActive && !this.scene.isActive()) return;
            mode.generateChallenge();
            mode.createChallengeUI(this);
        };
        const loadConfig = (mode.loadConfig && !mode.configLoaded)
            ? mode.loadConfig().catch((error) => {
                console.warn('Config failed to load, starting with defaults:', error);
                mode.configLoaded = true;
            })
            : Promise.resolve();
        const loadAudio = ensureAudioPacks(this, (entry && entry.audio) || []);
        Promise.all([loadConfig, loadAudio]).then(start, (error) => {
            console.warn('Mode assets failed to load, starting anyway:', error);
            start();
        });
    }

    handleAnswer(isCorrect, answer, x, y) {
        if (this.isProcessingAnswer) return;
        this.isProcessingAnswer = true;

        if (isCorrect) {
            const legendary = isLegendaryMode(this.gameMode);
            // The timed modes work out their own variable payout from how much the
            // player got done, with no streak/multiplier (like legendary, but with
            // a normal gift box). They flag themselves rather than being listed by
            // name here, so a new timed mode cannot silently fall through to the
            // streak payout.
            const paysOwnCoins = this.gameMode.paysOwnCoins === true;

            // Increment streak and get multiplier (only for streak-based modes)
            let newStreak, multiplier, baseCoinReward, finalCoinReward;

            let bonus = 0;
            if (!legendary && !paysOwnCoins) {
                const previousStreak = getStreak();
                newStreak = incrementStreak();
                multiplier = getMultiplier();
                bonus = milestoneBonus(previousStreak, newStreak);

                // Update booster bar
                updateBoosterBar(this.boosterBarElements, newStreak, this);

                // Generate random coin reward (1-3)
                baseCoinReward = getRandomCoinReward();
                finalCoinReward = baseCoinReward * multiplier;
            } else if (paysOwnCoins) {
                // Speed reading: 1 coin per word read, computed by the mode.
                multiplier = null;
                finalCoinReward = this.gameMode.earnedCoins;
            } else {
                // Legendary mode: use configured coin reward, no multiplier
                multiplier = null;
                finalCoinReward = this.gameMode.config.coinReward;
            }

            // Show success feedback particles and a happy chime
            this.showSuccessFeedback(x, y);
            playChime(this, bonus > 0 ? 'fanfare' : 'correct');

            // Show reward animation (gift box for normal, treasure chest for legendary)
            showGiftBoxReward(this, finalCoinReward, (legendary || paysOwnCoins) ? null : multiplier, legendary, async () => {
                // Animation complete - update coin count
                this.coinCount = addCoins(finalCoinReward);
                this.coinCounterText.setText(`${this.coinCount}`);

                // Streak milestone: extra coins with a little celebration
                if (bonus > 0) {
                    await this.showStreakBonus(bonus);
                    this.coinCount = addCoins(bonus);
                    this.coinCounterText.setText(`${this.coinCount}`);
                }

                // Clean up and load next challenge
                this.gameMode.cleanup(this);

                // This game is finished — forget it so a reload doesn't resume it.
                clearActiveMinigame();

                // Switch mode
                await this.selectGameMode();

                // Set up callback for new mode
                this.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
                    this.handleAnswer(isCorrect, answer, x, y);
                });

                // Check if we should show dice animation (not for forced/debug modes)
                const forcedMode = this.registry.get('pokeballGameMode');
                if (!forcedMode) {
                    // Remember the newly rolled mode so a reload resumes it.
                    saveActiveMinigame(this.gameMode.constructor.name);

                    // Show dice rolling animation before next challenge
                    this.showDiceRollAnimation();
                } else {
                    // Debug mode - go straight to next challenge
                    this.loadNextChallenge();
                }
            });
        } else {
            // Reset streak on wrong answer (not for legendary mode)
            if (!isLegendaryMode(this.gameMode)) {
                const newStreak = resetStreak();
                updateBoosterBar(this.boosterBarElements, newStreak, this);
            }

            // A sad chime plus a visual (non-text) error cue - the players can't read yet
            playChime(this, 'wrong');
            const errorText = this.add.text(this.cameras.main.width / 2, 600, '😢', {
                fontSize: '96px',
                padding: { y: 20 }
            }).setOrigin(0.5).setDepth(1001);

            // Remove error message and allow retry
            this.time.delayedCall(1000, () => {
                errorText.destroy();
                this.isProcessingAnswer = false;
            });
        }
    }

    // Leave the minigame scene and go back to catching Pokemon.
    goHome() {
        if (this.isProcessingAnswer) return;
        clearActiveMinigame();
        this.scene.start('MainGameScene');
    }

    // "🎉 +N" burst for a streak milestone. Resolves when it has faded.
    showStreakBonus(bonus) {
        return new Promise(resolve => {
            const width = this.cameras.main.width;
            const height = this.cameras.main.height;
            const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.4).setOrigin(0).setDepth(1000);
            const party = this.add.text(width / 2, height / 2 - 70, '🎉', { fontSize: '120px', padding: { y: 30 } })
                .setOrigin(0.5).setDepth(1001).setScale(0);
            const coinIcon = this.add.image(width / 2 - 50, height / 2 + 70, 'coin-tiny').setDepth(1001).setScale(0);
            const amount = this.add.text(width / 2 + 30, height / 2 + 70, `+${bonus}`, {
                font: 'bold 72px Arial', fill: '#FFD700', stroke: '#000000', strokeThickness: 6
            }).setOrigin(0.5).setDepth(1001).setScale(0);
            const all = [party, coinIcon, amount];

            this.tweens.add({ targets: party, scale: 1, duration: 300, ease: 'Back.easeOut' });
            this.tweens.add({ targets: [coinIcon, amount], scale: 1, duration: 300, delay: 150, ease: 'Back.easeOut' });
            this.tweens.add({ targets: party, angle: { from: -15, to: 15 }, duration: 200, yoyo: true, repeat: 3, delay: 300 });
            this.time.delayedCall(1500, () => {
                this.tweens.add({
                    targets: [...all, overlay],
                    alpha: 0,
                    duration: 300,
                    onComplete: () => {
                        all.forEach(o => o.destroy());
                        overlay.destroy();
                        resolve();
                    }
                });
            });
        });
    }

    showSuccessFeedback(x, y) {
        // Create the star particle texture once
        if (!this.textures.exists('successStar')) {
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
        }

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

    // Scene shutdown: tear down the running mode and HUD.
    teardown() {
        if (this.stopRemoteWatch) {
            this.stopRemoteWatch();
            this.stopRemoteWatch = null;
        }
        if (this.gameMode) {
            try {
                this.gameMode.cleanup(this);
            } catch (error) {
                console.warn('Mode cleanup failed during shutdown:', error);
            }
        }
        if (this.boosterBarElements) {
            destroyBoosterBar(this.boosterBarElements);
            this.boosterBarElements = null;
        }
    }
}
