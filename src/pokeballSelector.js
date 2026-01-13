/**
 * Pokeball Selector Component
 * Shows pokeball selection UI before catching Pokemon
 */

import { getInventory, POKEBALL_TYPES } from './inventory.js';

/**
 * Show pokeball selection UI
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {Function} onSelect - Callback when pokeball is selected (receives type)
 * @param {Function} onCancel - Callback when selection is cancelled
 */
export function showPokeballSelector(scene, onSelect, onCancel) {
    const width = scene.cameras.main.width;
    const height = scene.cameras.main.height;

    const selectorUI = {
        overlay: null,
        cards: [],
        cleanup: () => {
            selectorUI.overlay?.destroy();
            selectorUI.cards.forEach(card => {
                Object.values(card).forEach(element => {
                    if (element && element.destroy) {
                        element.destroy();
                    }
                });
            });
        }
    };

    // Semi-transparent overlay
    selectorUI.overlay = scene.add.rectangle(
        0, 0,
        width, height,
        0x000000,
        0.7
    );
    selectorUI.overlay.setOrigin(0, 0);
    selectorUI.overlay.setDepth(500);
    selectorUI.overlay.setInteractive();

    const inventory = getInventory();
    const pokeballTypes = ['pokeball', 'greatball', 'ultraball', 'legendaryball'];
    const spriteMap = {
        'pokeball': 'pokeball_poke-ball',
        'greatball': 'pokeball_great-ball',
        'ultraball': 'pokeball_ultra-ball',
        'legendaryball': 'pokeball_legendary-ball'
    };

    const ballSize = 128; // Size of pokeball sprites
    const spacing = 140; // Space between balls (reduced for 4 balls)
    const totalWidth = (ballSize * 4) + (spacing * 3);
    const startX = (width - totalWidth) / 2 + (ballSize / 2);
    const ballY = height / 2;

    pokeballTypes.forEach((type, index) => {
        const count = inventory[type] || 0;
        const x = startX + (index * (ballSize + spacing));

        // Pokeball sprite
        const ballSprite = scene.add.image(x, ballY, spriteMap[type]);
        ballSprite.setOrigin(0.5);
        ballSprite.setDepth(502);
        ballSprite.setScale(1.2); // Make balls nice and big

        // Show count badge (small number in corner)
        const countBadge = scene.add.text(x + 50, ballY - 50, count.toString(), {
            fontSize: '32px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 4,
            fontStyle: 'bold'
        });
        countBadge.setOrigin(0.5);
        countBadge.setDepth(503);

        // Make ball interactive if player has pokeballs
        if (count > 0) {
            ballSprite.setInteractive({ useHandCursor: true });

            // Hover effect - scale up
            ballSprite.on('pointerover', () => {
                ballSprite.setScale(1.3);
            });
            ballSprite.on('pointerout', () => {
                ballSprite.setScale(1.2);
            });

            // Click to select
            ballSprite.on('pointerdown', () => {
                selectorUI.cleanup();
                onSelect(type);
            });
        } else {
            // No pokeballs of this type - gray out
            ballSprite.setAlpha(0.3);
            countBadge.setAlpha(0.5);
        }

        selectorUI.cards.push({
            ballSprite, countBadge
        });
    });

    return selectorUI;
}
