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

    // Title text
    const title = scene.add.text(width / 2, 150, 'Välj Pokéball', {
        fontSize: '48px',
        fontFamily: 'Arial',
        color: '#FFD700',
        stroke: '#000000',
        strokeThickness: 6
    });
    title.setOrigin(0.5);
    title.setDepth(501);

    const inventory = getInventory();
    const pokeballTypes = ['pokeball', 'greatball', 'ultraball'];
    const spriteMap = {
        'pokeball': 'pokeball_poke-ball',
        'greatball': 'pokeball_great-ball',
        'ultraball': 'pokeball_ultra-ball'
    };
    const cardWidth = 200;
    const cardSpacing = 250;
    const startX = width / 2 - cardSpacing;
    const cardY = height / 2;

    pokeballTypes.forEach((type, index) => {
        const data = POKEBALL_TYPES[type];
        const count = inventory[type] || 0;
        const x = startX + index * cardSpacing;

        // Card background
        const card = scene.add.rectangle(x, cardY, cardWidth, 280, 0xffffff);
        card.setStrokeStyle(4, 0x000000);
        card.setDepth(501);

        // Pokeball sprite
        const ballSprite = scene.add.image(x, cardY - 60, spriteMap[type]);
        ballSprite.setOrigin(0.5);
        ballSprite.setDepth(502);
        ballSprite.setScale(0.7); // 128px * 0.7 = 90px

        // Name
        const name = scene.add.text(x, cardY + 10, data.name, {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#000000',
            fontStyle: 'bold'
        });
        name.setOrigin(0.5);
        name.setDepth(502);

        // Catch rate info
        const catchInfo = scene.add.text(x, cardY + 40, `+${Math.round((data.catchRate - 1) * 100)}%`, {
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#4CAF50',
            fontStyle: 'bold'
        });
        catchInfo.setOrigin(0.5);
        catchInfo.setDepth(502);

        // Count
        const countText = scene.add.text(x, cardY + 70, `Äger: ${count}`, {
            fontSize: '18px',
            fontFamily: 'Arial',
            color: count > 0 ? '#000000' : '#999999'
        });
        countText.setOrigin(0.5);
        countText.setDepth(502);

        // Make card interactive if player has pokeballs
        if (count > 0) {
            card.setInteractive({ useHandCursor: true });
            card.on('pointerover', () => {
                card.setFillStyle(0xf0f0f0);
            });
            card.on('pointerout', () => {
                card.setFillStyle(0xffffff);
            });
            card.on('pointerdown', () => {
                selectorUI.cleanup();
                title.destroy();
                onSelect(type);
            });
        } else {
            card.setAlpha(0.5);
            ballSprite.setAlpha(0.5);
            name.setAlpha(0.5);
            catchInfo.setAlpha(0.5);
            countText.setAlpha(0.5);
        }

        selectorUI.cards.push({
            card, ballSprite, name, catchInfo, countText
        });
    });

    // Cancel button (X in top right)
    const cancelBtn = scene.add.text(width / 2, height - 100, '✖️ Avbryt', {
        fontSize: '32px',
        fontFamily: 'Arial',
        color: '#FF6B6B',
        backgroundColor: '#ffffff',
        padding: { x: 20, y: 10 }
    });
    cancelBtn.setOrigin(0.5);
    cancelBtn.setDepth(502);
    cancelBtn.setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerover', () => {
        cancelBtn.setScale(1.1);
    });
    cancelBtn.on('pointerout', () => {
        cancelBtn.setScale(1);
    });
    cancelBtn.on('pointerdown', () => {
        selectorUI.cleanup();
        title.destroy();
        cancelBtn.destroy();
        if (onCancel) {
            onCancel();
        }
    });

    return selectorUI;
}
