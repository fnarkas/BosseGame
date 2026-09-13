import Phaser from 'phaser';
import { LetterMatchMode } from '../answerModes/LetterMatchMode.js';
import { DebugMode } from '../answerModes/DebugMode.js';
import { createInventoryHUD, updateInventoryHUD } from '../inventoryHUD.js';
import { hasPokeballs, removePokeball, POKEBALL_TYPES } from '../inventory.js';
import { showPokeballSelector } from '../pokeballSelector.js';
import { getRarityInfo, attemptCatch } from '../pokemonRarity.js';
import { getCoinCount, deductCoins } from '../currency.js';
import { POKEMON_DATA } from '../pokemonData.js';
import {
    isPokedexComplete, canUnlockMore, unlockNextBatch, unlockOne, countCaughtAvailable,
    markCelebrationDue, isCelebrationDue, clearCelebrationDue
} from '../pokedexUnlock.js';
import { showPokedexCelebration } from '../pokedexCelebration.js';
import { remoteLog } from '../remoteLog.js';
import { saveCaughtPokemonList, caughtIdSet } from '../caughtPokemon.js';
import { ensureAssets } from '../lazyLoad.js';
import { pokemonImageAsset, pokemonAudioAsset } from '../assetManifest.js';
import { takeNextSpawn, nextSpawnIsGift, TUTORIAL_POKEMON_IDS, SPAWN_QUEUE_KEY } from '../spawnQueue.js';
import { grantGift, giftContents } from '../gifts.js';
import { playChime } from '../sfx.js';
import { pullChanges, onRemoteChange } from '../account.js';
import { COIN_KEY } from '../currency.js';
import { INVENTORY_KEY } from '../inventory.js';
import { CONFIG_OVERRIDE_KEY } from '../minigameConfig.js';

export class MainGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainGameScene' });
        this.currentPokemon = null;
        this.currentPokemonSprite = null;
        this.MAX_ATTEMPTS = 3;
        this.attemptsLeft = this.MAX_ATTEMPTS;
        this.isAnimating = false; // Prevent multiple clicks during animation
        this.answerMode = null; // Will be set in create() based on game mode
        this.inventoryHUD = null;
        this.selectedPokeballType = 'pokeball'; // Default to regular pokeball
        this.encounterSeq = 0; // Bumped per encounter so a slow load can't show a stale Pokemon

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

        // What the parent changes in /admin while the child plays (coins,
        // pokeballs, the name-case settings) lands here through the live sync
        // in account.js; the next encounter and the Pokedex read the rest.
        this.stopRemoteWatch = onRemoteChange((keys) => this.onRemoteChange(keys));
        this.events.once('shutdown', () => {
            if (this.stopRemoteWatch) this.stopRemoteWatch();
            this.stopRemoteWatch = null;
        });

        // Store button (icon sprite)
        const storeBtn = this.add.image(width - 160, 52, 'store-icon');
        storeBtn.setOrigin(1, 0.5);
        storeBtn.setScale(0.5); // 128px * 0.5 = 64px
        storeBtn.setInteractive({ useHandCursor: true });

        storeBtn.on('pointerdown', () => {
            // Pause under the HTML overlay: no tweens, no input, no battery drain.
            this.scene.pause();
            window.openStore(() => this.onOverlayClosed());
        });

        // Settings button (gear icon)
        const settingsBtn = this.add.text(width - 230, 52, '⚙️', {
            fontSize: '48px',
            padding: { x: 10, y: 5 }
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

        settingsBtn.on('pointerdown', () => {
            this.scene.pause();
            this.scene.launch('SettingsScene', { previousScene: 'MainGameScene' });
        });

        // Hover effect for settings button
        settingsBtn.on('pointerover', () => {
            settingsBtn.setScale(1.1);
        });
        settingsBtn.on('pointerout', () => {
            settingsBtn.setScale(1);
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
            this.scene.pause();
            window.showPokedex(() => this.onOverlayClosed());
        });

        // Start first encounter
        this.startNewEncounter();
    }

    startNewEncounter(forceNewPokemon = false) {
        // Reset attempts
        this.attemptsLeft = this.MAX_ATTEMPTS;

        // Clean up previous Pokemon sprite and its tweens
        if (this.currentPokemonSprite) {
            this.tweens.killTweensOf(this.currentPokemonSprite);
            this.currentPokemonSprite.destroy();
            this.currentPokemonSprite = null;
        }

        // Clean up rarity indicator (stars)
        if (this.rarityIndicator) {
            this.rarityIndicator.destroy();
            this.rarityIndicator = null;
        }

        // Clean up answer mode UI
        if (this.answerMode) {
            this.answerMode.cleanup(this);
        }

        // Clear previous UI. Iterate over a copy: destroy() removes the child
        // from the display list, and mutating the list mid-forEach skips the
        // element right after every destroyed one (leaving e.g. the re-roll
        // price text behind on every encounter).
        [...this.children.list].forEach(child => {
            if (child.getData && child.getData('clearOnNewEncounter')) {
                child.destroy();
            }
        });

        // Every Pokemon in the pool caught? Big celebration, then the next
        // hundred open up. Comes before the pokeball check: the party needs
        // no balls.
        if (this.pokedexJustCompleted()) {
            if (isCelebrationDue()) {
                this.celebratePokedexComplete();
                return;
            }
            // Complete without a catch to celebrate (admin "catch all", a save
            // that was full before unlocking existed): slip one more Pokemon
            // in quietly, and the party comes when that one is caught.
            const extra = unlockOne();
            console.log(`Pokedex already complete; unlocked #${extra.to} to catch first`);
        }

        const restoreGift = !forceNewPokemon && this.registry.get('currentGift');
        const restore = !forceNewPokemon && !restoreGift && this.registry.get('currentPokemon');

        // Check if player has pokeballs before starting encounter. A present
        // (which may well hold Poké Balls) can always be opened.
        if (!hasPokeballs() && !restoreGift && !nextSpawnIsGift()) {
            // No pokeballs! Show message immediately
            this.showNoPokeballsPopup();
            return;
        }

        const encounter = ++this.encounterSeq;
        const stale = () => encounter !== this.encounterSeq || this.sceneGone();

        // Before drawing a new Pokemon, pick up what the parent may have queued
        // in /admin meanwhile (throttled; instant when nothing changed).
        const prepare = (restore || restoreGift) ? Promise.resolve() : pullChanges();
        prepare.then(() => {
            if (stale()) return;
            this.currentGift = null;
            if (restoreGift) {
                this.currentGift = restoreGift;
                this.currentPokemon = null;
                this.showGift();
                return;
            }
            if (restore) {
                // Restore previous Pokemon from registry
                this.currentPokemon = this.registry.get('currentPokemon');
                // Re-derive the tutorial flag: it is per-scene state and would
                // otherwise be lost after a trip to the minigame scene, turning a
                // guaranteed tutorial catch into a random one.
                const caughtList = this.registry.get('caughtPokemon') || [];
                this.isTutorialCatch = caughtList.length < TUTORIAL_POKEMON_IDS.length &&
                    TUTORIAL_POKEMON_IDS.includes(this.currentPokemon.id);
                console.log('Restoring previous Pokemon:', this.currentPokemon.name);
            } else {
                // Spawn the next Pokemon (or present) from the queue
                this.spawnPokemon();
                if (this.currentGift) {
                    this.registry.set('currentGift', this.currentGift);
                    this.registry.remove('currentPokemon');
                    this.showGift();
                    return;
                }
                // Save to registry
                this.registry.set('currentPokemon', this.currentPokemon);
            }

            // Fetch this Pokemon's artwork and name audio (instant when cached),
            // load the answer-mode config if needed, then show the encounter.
            const pokemon = this.currentPokemon;
            const loadAssets = ensureAssets(this, {
                images: [pokemonImageAsset(pokemon.id)],
                audio: [pokemonAudioAsset(pokemon.id)]
            });
            const loadConfig = (this.answerMode.loadConfig && !this.answerMode.configLoaded)
                ? this.answerMode.loadConfig().catch((error) => {
                    console.warn('Config failed to load, starting with defaults:', error);
                    this.answerMode.configLoaded = true;
                })
                : Promise.resolve();

            const show = () => {
                // A newer encounter started, or the scene stopped, while loading.
                if (stale()) return;
                this.displayPokemon();
                this.answerMode.generateChallenge(this.currentPokemon);
                this.answerMode.createChallengeUI(this, this.attemptsLeft);
            };
            Promise.all([loadAssets, loadConfig]).then(show, (error) => {
                console.warn('Encounter assets failed to load, showing anyway:', error);
                show();
            });
        });
    }

    // True once this scene has been stopped, so a late async step must not
    // build UI into it. A paused scene (Pokedex or store open) is not gone.
    sceneGone() {
        if (!this.scene.isActive || this.scene.isActive()) return false;
        return !(this.scene.isPaused && this.scene.isPaused());
    }

    // Keys the live sync just changed on this device.
    onRemoteChange(keys) {
        if (this.sceneGone()) return;
        if (keys.includes(COIN_KEY) || keys.includes(INVENTORY_KEY) || keys.includes(SPAWN_QUEUE_KEY)) {
            if (this.inventoryHUD) updateInventoryHUD(this.inventoryHUD);
            // A parent restocking the bag, or queueing a present, lifts the
            // "no pokeballs" popup.
            this.dismissNoPokeballsPopupIfStocked();
        }
        if (keys.includes(CONFIG_OVERRIDE_KEY) && this.answerMode) {
            // Name/keyboard case settings: re-read on the next encounter.
            this.answerMode.configLoaded = false;
        }
    }

    spawnPokemon() {
        // The next encounter comes from the saved spawn queue (spawnQueue.js):
        // the tutorial trio first, then random uncaught Pokemon, and whatever
        // a parent pushed to the front from /admin. The first three catches are
        // guaranteed as long as the Pokemon is one of the tutorial trio.
        const caughtList = this.registry.get('caughtPokemon') || [];
        const next = takeNextSpawn({ caught: caughtIdSet(caughtList) });
        if (next && next.gift) {
            // A present from the parent (gifts.js) instead of a Pokemon.
            this.currentGift = next.gift;
            this.currentPokemon = null;
            this.isTutorialCatch = false;
            console.log('Spawning a present:', next.gift);
            return;
        }
        this.currentGift = null;
        this.isTutorialCatch = caughtList.length < TUTORIAL_POKEMON_IDS.length &&
            TUTORIAL_POKEMON_IDS.includes(next.id);
        console.log(`Spawning ${next.name}${this.isTutorialCatch ? ' (tutorial, guaranteed catch)' : ''}`);

        this.currentPokemon = {
            id: next.id,
            name: next.name
        };
    }

    // A present: a gift box where the Pokemon would be. Tapping it shakes the
    // box, bursts it open and shows what was inside while it goes into the bag;
    // then the next encounter starts. No text: the pictures say it all.
    showGift() {
        const width = this.cameras.main.width;
        const gift = this.currentGift;
        remoteLog('game', 'gift', { gift });
        const x = width / 2;
        const y = 300;

        const box = this.add.text(x, y, '🎁', { fontSize: '160px', padding: { y: 40 } }).setOrigin(0.5);
        box.setData('clearOnNewEncounter', true);
        box.setData('giftBox', true);
        box.setInteractive({ useHandCursor: true });
        this.currentGiftBox = box;

        const pulse = this.tweens.add({
            targets: box, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        box.once('pointerdown', () => {
            if (this.isAnimating) return;
            this.isAnimating = true;
            pulse.stop();
            box.setScale(1);
            playChime(this, 'fanfare');

            // Jiggle, then burst
            this.tweens.add({
                targets: box, angle: 12, duration: 90, yoyo: true, repeat: 5,
                onComplete: () => {
                    if (this.currentGiftBox !== box) return;
                    box.setAngle(0);
                    this.burstGift(box, gift);
                }
            });
        });
    }

    burstGift(box, gift) {
        const x = box.x;
        const y = box.y;
        const colors = [0xFFD700, 0xFF6B6B, 0x4ECDC4, 0xA78BFA, 0xFFE66D];
        for (let i = 0; i < 18; i++) {
            const angle = (Math.PI * 2 * i) / 18;
            const piece = this.add.rectangle(x, y, 14, 14, colors[i % colors.length]);
            piece.setData('clearOnNewEncounter', true);
            this.tweens.add({
                targets: piece,
                x: x + Math.cos(angle) * (120 + Math.random() * 60),
                y: y + Math.sin(angle) * (120 + Math.random() * 60),
                alpha: 0, angle: 180, duration: 700, ease: 'Cubic.easeOut',
                onComplete: () => piece.destroy()
            });
        }
        this.tweens.add({
            targets: box, alpha: 0, scale: 0.4, duration: 250,
            onComplete: () => {
                box.destroy();
                if (this.currentGiftBox === box) this.currentGiftBox = null;
                this.revealGift(x, y, gift);
            }
        });
    }

    revealGift(x, y, gift) {
        // Grant first, so a reload mid-animation can never lose the present.
        const granted = grantGift(gift) || {};
        this.currentGift = null;
        this.registry.remove('currentGift');
        updateInventoryHUD(this.inventoryHUD);

        // One row: icon + count per item, popping in one after another.
        const items = giftContents(granted);
        const spacing = 170;
        const startX = x - ((items.length - 1) * spacing) / 2;
        const shown = [];
        items.forEach((item, index) => {
            const ix = startX + index * spacing;
            const icon = this.add.image(ix, y - 20, item.sprite).setOrigin(0.5).setScale(0);
            const count = this.add.text(ix, y + 60, `+${item.count}`, {
                fontSize: '44px', fontFamily: 'Arial', fill: '#FFD700', stroke: '#000000', strokeThickness: 5
            }).setOrigin(0.5).setScale(0);
            icon.setData('clearOnNewEncounter', true);
            count.setData('clearOnNewEncounter', true);
            shown.push(icon, count);
            this.tweens.add({
                targets: [icon, count], scale: 1.4 * item.spriteScale, duration: 350, delay: index * 200, ease: 'Back.easeOut'
            });
        });

        this.time.delayedCall(1800 + items.length * 200, () => {
            this.tweens.add({
                targets: shown, alpha: 0, duration: 400,
                onComplete: () => {
                    shown.forEach(obj => obj.destroy());
                    this.isAnimating = false;
                    this.startNewEncounter();
                }
            });
        });
    }

    displayPokemon() {
        const width = this.cameras.main.width;
        remoteLog('game', 'encounter', { id: this.currentPokemon.id, name: this.currentPokemon.name, tutorial: !!this.isTutorialCatch });

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
        remoteLog('game', 'caught', { id: this.currentPokemon.id, name: this.currentPokemon.name });

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

    // The 'star' particle texture is shared by the catch-success burst, the
    // break-free explosion and the triumphant return. It must exist before any
    // of them runs, otherwise Phaser draws the green "missing texture" squares.
    ensureStarTexture() {
        if (!this.textures.exists('star')) {
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
    }

    showSuccessParticles(pokeball) {
        console.log('showSuccessParticles called!', 'pokeball position:', pokeball.x, pokeball.y);

        this.ensureStarTexture();

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
                // Explicitly reset hearts before starting new encounter
                this.attemptsLeft = this.MAX_ATTEMPTS;
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

    // Called when the store or Pokedex overlay closes. The scene was paused
    // while it was open; refresh anything that could have changed in there.
    onOverlayClosed() {
        if (this.scene.isPaused && this.scene.isPaused()) {
            this.scene.resume();
        }
        updateInventoryHUD(this.inventoryHUD);
        this.dismissNoPokeballsPopupIfStocked();
    }

    dismissNoPokeballsPopupIfStocked() {
        if (!this.noPokeballsPopupElements || this.noPokeballsPopupElements.length === 0) return;
        // Balls arrived, or a present (which can be opened without any) is next.
        if (!hasPokeballs() && !nextSpawnIsGift()) return;
        this.noPokeballsPopupElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.noPokeballsPopupElements = null;
        this.startNewEncounter();
    }

    catchFailed(pokeball) {
        remoteLog('game', 'escaped', { id: this.currentPokemon.id, name: this.currentPokemon.name });
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

        this.ensureStarTexture();

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
        remoteLog('game', 'ranAway', { id: this.currentPokemon.id, name: this.currentPokemon.name });
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

    // True when the caught list covers every unlocked Pokemon and there are
    // more to unlock. Once all of POKEMON_DATA is unlocked and caught the game
    // simply keeps spawning repeats (see spawnPokemon).
    pokedexJustCompleted() {
        const caughtList = this.registry.get('caughtPokemon') || [];
        return isPokedexComplete(caughtList) && canUnlockMore();
    }

    celebratePokedexComplete() {
        const caughtList = this.registry.get('caughtPokemon') || [];
        const completedCount = countCaughtAvailable(caughtList);
        // Unlock before the show so the new batch is saved even if the tab is
        // closed mid-celebration.
        const batch = unlockNextBatch();
        clearCelebrationDue();
        console.log(`Pokedex complete (${completedCount})! Unlocked #${batch.from + 1}-${batch.to}`);
        remoteLog('game', 'celebration', { completedCount, from: batch.from, to: batch.to });
        this.isAnimating = true;
        this.registry.remove('currentPokemon');
        showPokedexCelebration(this, { completedCount, batch }, () => {
            this.isAnimating = false;
            this.attemptsLeft = this.MAX_ATTEMPTS;
            this.startNewEncounter(true);
        });
    }

    saveCaughtPokemon() {
        const caughtList = this.registry.get('caughtPokemon') || [];

        // Check if already caught (the list may contain legacy plain ids)
        if (!caughtIdSet(caughtList).has(this.currentPokemon.id)) {
            // Save without types - they come from POKEMON_DATA
            caughtList.push({
                id: this.currentPokemon.id,
                name: this.currentPokemon.name,
                caughtDate: new Date().toISOString()
            });

            this.registry.set('caughtPokemon', caughtList);
            saveCaughtPokemonList(caughtList);
            // This catch filled the Pokedex: the next encounter is the party.
            if (isPokedexComplete(caughtList) && canUnlockMore()) markCelebrationDue();
        }

        // Clear current Pokemon from registry so next encounter generates a new one
        this.registry.remove('currentPokemon');
    }
}
