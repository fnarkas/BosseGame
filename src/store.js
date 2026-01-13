/**
 * Store System
 * Handles the pokeball store UI and purchase logic
 */

import { getCoinCount, deductCoins } from './currency.js';
import { getInventory, addPokeball, POKEBALL_TYPES } from './inventory.js';

/**
 * Initialize the store UI
 */
export function initStore() {
    const storeOverlay = document.getElementById('store-overlay');
    const backBtn = document.getElementById('store-back-btn');
    const storeGrid = document.getElementById('store-grid');

    // Back button handler
    backBtn.addEventListener('click', closeStore);

    // Generate pokeball cards
    generatePokeballCards(storeGrid);
}

/**
 * Open the store
 */
export function openStore() {
    const storeOverlay = document.getElementById('store-overlay');
    storeOverlay.style.display = 'block';
    updateStoreDisplay();
}

/**
 * Close the store
 */
export function closeStore() {
    const storeOverlay = document.getElementById('store-overlay');
    storeOverlay.style.display = 'none';
}

/**
 * Update the store display (coin balance and inventory counts)
 */
export function updateStoreDisplay() {
    const coinCount = document.getElementById('coin-count');
    const coins = getCoinCount();
    coinCount.textContent = `x${coins}`;

    // Update inventory counts for each pokeball card
    const inventory = getInventory();
    Object.keys(POKEBALL_TYPES).forEach(type => {
        const countElement = document.getElementById(`pokeball-inventory-${type}`);
        if (countElement) {
            countElement.textContent = `Äger: ${inventory[type]}`;
        }

        // Update buy button state
        const buyBtn = document.getElementById(`pokeball-buy-${type}`);
        if (buyBtn) {
            const price = POKEBALL_TYPES[type].price;
            buyBtn.disabled = coins < price;
        }
    });
}

/**
 * Generate pokeball cards in the store grid
 */
function generatePokeballCards(storeGrid) {
    storeGrid.innerHTML = '';

    Object.entries(POKEBALL_TYPES).forEach(([type, data]) => {
        const card = createPokeballCard(type, data);
        storeGrid.appendChild(card);
    });
}

/**
 * Create a single pokeball card
 */
function createPokeballCard(type, data) {
    const card = document.createElement('div');
    card.className = 'pokeball-card';

    // Image
    const img = document.createElement('img');
    img.className = 'pokeball-card-image';
    // Map type names to optimized small sprite filenames
    const fileMap = {
        'pokeball': 'poke-ball-small',
        'greatball': 'great-ball-small',
        'ultraball': 'ultra-ball-small',
        'legendaryball': 'legendary-ball'
    };
    img.src = `pokeball_sprites/${fileMap[type]}.png`;
    img.alt = data.name;
    card.appendChild(img);

    // Name
    const name = document.createElement('div');
    name.className = 'pokeball-card-name';
    name.textContent = data.name;
    card.appendChild(name);

    // Price - using coin image
    const price = document.createElement('div');
    price.className = 'pokeball-card-price';

    const coinImg = document.createElement('img');
    coinImg.src = 'coin.png';
    coinImg.className = 'coin-icon-small';
    coinImg.alt = 'Coins';

    price.appendChild(coinImg);
    price.appendChild(document.createTextNode(` ${data.price}`));
    card.appendChild(price);

    // Inventory count
    const inventory = getInventory();
    const invCount = document.createElement('div');
    invCount.className = 'pokeball-card-inventory';
    invCount.id = `pokeball-inventory-${type}`;
    invCount.textContent = `Äger: ${inventory[type]}`;
    card.appendChild(invCount);

    // Buy button
    const buyBtn = document.createElement('button');
    buyBtn.className = 'pokeball-buy-btn';
    buyBtn.id = `pokeball-buy-${type}`;
    buyBtn.textContent = 'KÖP';

    const coins = getCoinCount();
    buyBtn.disabled = coins < data.price;

    buyBtn.addEventListener('click', () => {
        purchasePokeball(type, data.price);
    });
    card.appendChild(buyBtn);

    return card;
}

/**
 * Handle pokeball purchase
 */
function purchasePokeball(type, price) {
    const newCoinCount = deductCoins(price);

    if (newCoinCount === null) {
        // Not enough coins
        alert('Inte tillräckligt med mynt!');
        return;
    }

    // Add pokeball to inventory
    addPokeball(type);

    // Show purchase feedback
    showPurchaseFeedback(type);

    // Update display
    updateStoreDisplay();
}

/**
 * Show purchase success feedback
 */
function showPurchaseFeedback(type) {
    const pokeballName = POKEBALL_TYPES[type].name;

    // Create feedback overlay
    const feedback = document.createElement('div');
    feedback.style.position = 'fixed';
    feedback.style.top = '50%';
    feedback.style.left = '50%';
    feedback.style.transform = 'translate(-50%, -50%)';
    feedback.style.background = 'rgba(0, 0, 0, 0.8)';
    feedback.style.color = '#4CAF50';
    feedback.style.padding = '30px 60px';
    feedback.style.borderRadius = '15px';
    feedback.style.fontSize = '32px';
    feedback.style.fontWeight = 'bold';
    feedback.style.zIndex = '2000';
    feedback.style.border = '3px solid #4CAF50';
    feedback.textContent = `✅ ${pokeballName} köpt!`;

    document.body.appendChild(feedback);

    // Remove after 1.5 seconds
    setTimeout(() => {
        feedback.remove();
    }, 1500);
}
