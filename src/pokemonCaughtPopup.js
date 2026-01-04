import { POKEMON_DATA } from './pokemonData.js';

let onContinueCallback = null;

/**
 * Initialize the Pokemon Caught Popup
 */
export function initPokemonCaughtPopup() {
    const continueBtn = document.getElementById('popup-continue-btn');
    continueBtn.addEventListener('click', hidePokemonCaughtPopup);
}

/**
 * Show the Pokemon Caught popup with Pokemon info
 * @param {number} pokemonId - The ID of the caught Pokemon
 * @param {Function} callback - Callback to run when popup is closed
 */
export function showPokemonCaughtPopup(pokemonId, callback) {
    // Store callback
    onContinueCallback = callback;

    // Get Pokemon data
    const pokemonData = POKEMON_DATA.find(p => p.id === pokemonId);
    if (!pokemonData) {
        console.error('Pokemon data not found for ID:', pokemonId);
        if (callback) callback();
        return;
    }

    // Get popup elements
    const popup = document.getElementById('pokemon-caught-popup');
    const image = document.getElementById('popup-pokemon-image');
    const number = document.getElementById('popup-pokemon-number');
    const name = document.getElementById('popup-pokemon-name');
    const typesContainer = document.getElementById('popup-pokemon-types');
    const stats = document.getElementById('popup-pokemon-stats');

    // Populate Pokemon image
    image.src = `pokemon_images/${pokemonData.filename}`;
    image.alt = pokemonData.name;

    // Populate Pokemon number
    number.textContent = `#${String(pokemonData.id).padStart(3, '0')}`;

    // Populate Pokemon name
    name.textContent = pokemonData.name.toUpperCase();

    // Populate type icons
    typesContainer.innerHTML = '';
    if (pokemonData.types && pokemonData.types.length > 0) {
        pokemonData.types.forEach(typeId => {
            const typeIcon = document.createElement('img');
            typeIcon.className = 'popup-type-icon';
            typeIcon.src = `type_icons_circular/${typeId}.png`;
            typeIcon.alt = `Type ${typeId}`;
            typesContainer.appendChild(typeIcon);
        });
    }

    // Populate stats
    stats.textContent = `Height: ${pokemonData.height / 10}m  |  Weight: ${pokemonData.weight / 10}kg`;

    // Show popup
    popup.style.display = 'flex';
}

/**
 * Hide the Pokemon Caught popup
 */
export function hidePokemonCaughtPopup() {
    const popup = document.getElementById('pokemon-caught-popup');
    popup.style.display = 'none';

    // Call callback if exists
    if (onContinueCallback) {
        const callback = onContinueCallback;
        onContinueCallback = null;
        callback();
    }
}
