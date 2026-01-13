/**
 * Inventory HUD Component
 * Displays coins and pokeball inventory in game scenes
 */

import { getCoinCount } from './currency.js';
import { getInventory, POKEBALL_TYPES } from './inventory.js';

/**
 * Create inventory HUD for a scene
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {number} x - X position (right edge)
 * @param {number} y - Y position (top)
 * @returns {Object} HUD elements for updating
 */
export function createInventoryHUD(scene, x, y) {
    const hudElements = {
        coinText: null,
        pokeballTexts: {}
    };

    let currentY = y;
    const pokeballIconSize = 32; // Base size for pokeballs
    const coinIconSize = 48; // 1.5x pokeball size
    const spacing = 38; // Consistent vertical spacing
    const iconX = x - 70; // Consistent X position for all icons (moved right)
    const textX = x - 20; // Text position

    // Coin display - use tiny sprite (1.5x pokeball size)
    const coinIcon = scene.add.image(iconX, currentY + coinIconSize/2, 'coin-tiny');
    coinIcon.setOrigin(0.5, 0.5); // Center origin for consistent alignment
    coinIcon.setScale(0.75); // 64px * 0.75 = 48px (1.5x pokeball size)

    const coinCount = getCoinCount();
    hudElements.coinText = scene.add.text(textX, currentY + 4, `${coinCount}`, {
        font: 'bold 24px Arial',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
    }).setOrigin(1, 0);

    currentY += spacing + 10; // Extra space after coin

    // Pokeball inventory - use tiny sprites
    const inventory = getInventory();
    const pokeballTypes = ['pokeball', 'greatball', 'ultraball', 'legendaryball'];
    const spriteMap = {
        'pokeball': 'pokeball_poke-ball-tiny',
        'greatball': 'pokeball_great-ball-tiny',
        'ultraball': 'pokeball_ultra-ball-tiny',
        'legendaryball': 'pokeball_legendary-ball-tiny'
    };

    pokeballTypes.forEach(type => {
        const data = POKEBALL_TYPES[type];
        const count = inventory[type] || 0;

        // Pokeball sprite icon (tiny version)
        const ballIcon = scene.add.image(iconX, currentY + pokeballIconSize/2, spriteMap[type]);
        ballIcon.setOrigin(0.5, 0.5); // Center origin for consistent alignment
        ballIcon.setScale(0.5); // 64px * 0.5 = 32px

        // Count text
        hudElements.pokeballTexts[type] = scene.add.text(textX, currentY + 4, `${count}`, {
            font: 'bold 20px Arial',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(1, 0);

        currentY += spacing;
    });

    return hudElements;
}

/**
 * Update inventory HUD display
 * @param {Object} hudElements - HUD elements returned from createInventoryHUD
 */
export function updateInventoryHUD(hudElements) {
    // Update coin count
    const coinCount = getCoinCount();
    hudElements.coinText.setText(`x${coinCount}`);

    // Update pokeball counts
    const inventory = getInventory();
    Object.keys(hudElements.pokeballTexts).forEach(type => {
        const count = inventory[type] || 0;
        hudElements.pokeballTexts[type].setText(`x${count}`);
    });
}
