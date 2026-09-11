import Phaser from 'phaser';
import { loadModeWeights, getEnabledSlices } from '../minigameWheel.js';
import { bootImages, audioPacks, BOOT_AUDIO_PACKS } from '../assetManifest.js';
import { getFloat } from '../storage.js';
import { getCaughtPokemonList } from '../caughtPokemon.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Loading emoji
        const loadingEmoji = this.add.text(width / 2, height / 2 - 80, '⚡', {
            font: '120px Arial'
        });
        loadingEmoji.setOrigin(0.5, 0.5);

        // Progress bar
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2, 320, 50);

        // Update progress bar
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 + 10, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingEmoji.destroy();
        });

        // Only what every screen needs. Pokemon artwork/names and the bigger
        // audio packs are loaded on demand (see assetManifest.js, lazyLoad.js).
        bootImages().forEach(a => this.load.image(a.key, a.url));
        audioPacks(BOOT_AUDIO_PACKS).forEach(a => this.load.audio(a.key, a.url));
    }

    async create() {
        // Load and apply saved volume
        this.sound.volume = getFloat('gameVolume', 1.0);

        // Generate dice face textures
        this.generateDiceFaces();

        // Build the wheel from the configured weights so that modes set to
        // probability 0 don't appear as slices. Store the enabled slice order so
        // PokeballGameScene can map the selected mode to its slice on the wheel.
        const weights = await loadModeWeights();
        const enabledSlices = getEnabledSlices(weights);
        this.registry.set('wheelSlices', enabledSlices);
        this.generateWheelTexture(enabledSlices);

        // Store game data globally
        this.registry.set('caughtPokemon', this.loadCaughtPokemon());

        // Start the appropriate scene based on URL routing
        const startScene = this.registry.get('startScene') || 'MainGameScene';
        this.scene.start(startScene);
    }

    generateDiceFaces() {
        // Create 15 dice faces with different colored dots representing each game mode
        const colors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3, 0xA78BFA, 0xFF8C42, 0x26A69A, 0xFFC107, 0xFFD700, 0x00BCD4, 0xE91E63, 0x4CAF50, 0x9C27B0, 0xFF5722, 0x9b59b6]; // Red, Cyan, Yellow, Mint, Purple, Orange, Teal, Amber, Gold, Cyan Blue, Pink, Green, Deep Purple, Deep Orange, Piano Purple
        const dotPatterns = [
            [{ x: 0.5, y: 0.5 }], // 1 dot (center)
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }], // 2 dots (diagonal)
            [{ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 }], // 3 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 4 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 5 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 6 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 }], // 7 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], // 8 dots
            [{ x: 0.25, y: 0.25 }, { x: 0.5, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0.25, y: 0.75 }, { x: 0.5, y: 0.75 }, { x: 0.75, y: 0.75 }], // 9 dots (3x3 grid)
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }], // 10 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.4 }, { x: 0.2, y: 0.6 }, { x: 0.8, y: 0.6 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }], // 11 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.35 }, { x: 0.5, y: 0.65 }], // 12 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }, { x: 0.3, y: 0.35 }, { x: 0.7, y: 0.65 }], // 13 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.2, y: 0.45 }, { x: 0.8, y: 0.45 }, { x: 0.2, y: 0.55 }, { x: 0.8, y: 0.55 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.35 }, { x: 0.5, y: 0.65 }], // 14 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.2, y: 0.4 }, { x: 0.8, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.6 }, { x: 0.8, y: 0.6 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }, { x: 0.35, y: 0.35 }, { x: 0.65, y: 0.35 }] // 15 dots
        ];

        for (let i = 0; i < 15; i++) {
            const graphics = this.add.graphics();

            // Draw white rounded rectangle background
            graphics.fillStyle(0xFFFFFF, 1);
            graphics.fillRoundedRect(0, 0, 100, 100, 10);

            // Draw border
            graphics.lineStyle(4, 0x000000, 1);
            graphics.strokeRoundedRect(0, 0, 100, 100, 10);

            // Draw dots
            graphics.fillStyle(colors[i], 1);
            dotPatterns[i].forEach(dot => {
                const x = dot.x * 100;
                const y = dot.y * 100;
                graphics.fillCircle(x, y, 12);

                // Border on dots
                graphics.lineStyle(2, 0x000000, 1);
                graphics.strokeCircle(x, y, 12);
            });

            // Generate texture
            graphics.generateTexture(`dice-face-${i + 1}`, 100, 100);
            graphics.destroy();
        }
    }

    generateWheelTexture(enabledSlices) {
        const size = 600;
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2 - 10;
        const slices = enabledSlices.length;
        const anglePerSlice = (Math.PI * 2) / slices;

        // Per-slice color and icon come from the shared wheel definition, so the
        // wheel only contains the modes that are actually enabled in the config.
        const colors = enabledSlices.map(slice => slice.color);
        const iconKeys = enabledSlices.map(slice => slice.iconKey);

        const graphics = this.add.graphics();

        // Draw each slice
        // Offset by half a slice so slice 0 is CENTERED at the top (not edge at top)
        const offset = -Math.PI / 2 - anglePerSlice / 2;
        for (let i = 0; i < slices; i++) {
            const startAngle = i * anglePerSlice + offset;
            const endAngle = (i + 1) * anglePerSlice + offset;

            // Draw slice background
            graphics.fillStyle(colors[i], 1);
            graphics.beginPath();
            graphics.moveTo(centerX, centerY);
            graphics.arc(centerX, centerY, radius, startAngle, endAngle, false);
            graphics.closePath();
            graphics.fillPath();

            // Draw slice border
            graphics.lineStyle(3, 0x000000, 1);
            graphics.beginPath();
            graphics.moveTo(centerX, centerY);
            graphics.lineTo(
                centerX + Math.cos(startAngle) * radius,
                centerY + Math.sin(startAngle) * radius
            );
            graphics.strokePath();
        }

        // Draw outer circle border (after slices)
        graphics.lineStyle(6, 0x000000, 1);
        graphics.strokeCircle(centerX, centerY, radius);

        // Generate the base wheel texture
        graphics.generateTexture('game-wheel-base', size, size);
        graphics.clear();
        graphics.destroy();

        // Now create a render texture to add the icons
        const rt = this.add.renderTexture(0, 0, size, size);

        // First draw the base wheel
        const wheelBase = this.add.image(centerX, centerY, 'game-wheel-base');
        rt.draw(wheelBase);
        wheelBase.destroy();

        // Add icons to each slice
        for (let i = 0; i < slices; i++) {
            // Use same offset as slice drawing to center icons properly
            const sliceOffset = -Math.PI / 2 - anglePerSlice / 2;
            const angle = i * anglePerSlice + sliceOffset + anglePerSlice / 2; // Center of slice
            const iconDistance = radius * 0.65; // 65% from center
            const iconX = centerX + Math.cos(angle) * iconDistance;
            const iconY = centerY + Math.sin(angle) * iconDistance;

            const icon = this.add.image(iconX, iconY, iconKeys[i]);
            icon.setScale(0.35); // Smaller icons to fit better
            // Rotate icon so top faces outward from center
            const angleDegrees = (angle * 180 / Math.PI); // Convert to degrees
            icon.setAngle(angleDegrees + 90); // +90 to align top edge outward
            rt.draw(icon);
            icon.destroy();
        }

        // Save as final wheel texture
        rt.saveTexture('game-wheel');
        rt.destroy();

        // Generate pointer (triangle at top)
        const pointer = this.add.graphics();
        pointer.fillStyle(0xFF4444, 1);
        pointer.lineStyle(3, 0x000000, 1);
        pointer.beginPath();
        pointer.moveTo(50, 0);
        pointer.lineTo(30, 40);
        pointer.lineTo(70, 40);
        pointer.closePath();
        pointer.fillPath();
        pointer.strokePath();
        pointer.generateTexture('wheel-pointer', 100, 40);
        pointer.destroy();
    }

    loadCaughtPokemon() {
        return getCaughtPokemonList();
    }
}
