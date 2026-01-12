import { POKEMON_DATA } from './pokemonData.js';
import { getRarityInfo } from './pokemonRarity.js';

let gameInstance = null;
let resumeCallback = null;

/**
 * Initialize the Pokedex module with the Phaser game instance
 * @param {Phaser.Game} game - The Phaser game instance for audio access
 */
export function initPokedex(game) {
    gameInstance = game;

    // Set up back button
    const backBtn = document.getElementById('pokedex-back-btn');
    backBtn.addEventListener('click', hidePokedex);
}

/**
 * Show the Pokedex overlay
 * @param {Function} onClose - Optional callback to call when Pokedex closes
 */
export function showPokedex(onClose) {
    const overlay = document.getElementById('pokedex-overlay');
    overlay.style.display = 'block';

    // Store resume callback
    resumeCallback = onClose || null;

    // Render the Pokemon grid
    renderPokedexGrid();
}

/**
 * Hide the Pokedex overlay
 */
export function hidePokedex() {
    const overlay = document.getElementById('pokedex-overlay');
    overlay.style.display = 'none';

    // Call resume callback if it exists
    if (resumeCallback) {
        resumeCallback();
        resumeCallback = null;
    }
}

/**
 * Render the Pokemon grid with all Pokemon
 */
function renderPokedexGrid() {
    const grid = document.getElementById('pokedex-grid');
    const statsDiv = document.getElementById('pokedex-stats');

    // Load caught Pokemon from localStorage
    const caughtPokemon = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
    // Handle both object format {id: 1, name: "...", caughtDate: "..."} and plain ID format [1, 2, 3]
    const caughtIds = new Set(caughtPokemon.map(p => p.id || p));

    // Update stats
    statsDiv.textContent = `Fångade: ${caughtPokemon.length} / ${POKEMON_DATA.length}`;

    // Clear existing grid
    grid.innerHTML = '';

    // Add placeholder for Pokemon #000
    const placeholderCard = document.createElement('div');
    placeholderCard.className = 'pokemon-card';
    const placeholderNumber = document.createElement('div');
    placeholderNumber.className = 'pokemon-card-number uncaught';
    placeholderNumber.textContent = '#000';
    placeholderCard.appendChild(placeholderNumber);
    grid.appendChild(placeholderCard);

    // Generate all Pokemon cards
    POKEMON_DATA.forEach((pokemon) => {
        const isCaught = caughtIds.has(pokemon.id);
        const rarityInfo = getRarityInfo(pokemon);

        // Create card element
        const card = document.createElement('div');
        card.className = `pokemon-card ${isCaught ? 'caught' : ''}`;

        // Add click handler for caught Pokemon to show popup
        if (isCaught) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                // Show the popup and play audio
                window.showPokemonCaughtPopup(pokemon.id, () => {
                    playPokemonAudio(pokemon.id);
                });
            });
        }

        // Pokemon image
        const img = document.createElement('img');
        img.className = `pokemon-card-image ${!isCaught ? 'uncaught' : ''}`;
        img.src = `pokemon_images/${pokemon.filename}`;
        img.alt = isCaught ? pokemon.name : '???';
        card.appendChild(img);

        // Pokemon name
        const name = document.createElement('div');
        name.className = `pokemon-card-name ${!isCaught ? 'uncaught' : ''}`;
        name.textContent = isCaught ? pokemon.name : '???';
        card.appendChild(name);

        // Pokemon number
        const number = document.createElement('div');
        number.className = `pokemon-card-number ${!isCaught ? 'uncaught' : ''}`;
        number.textContent = `#${String(pokemon.id).padStart(3, '0')}`;
        card.appendChild(number);

        // Stars (rarity indicator) - only show for caught Pokemon
        if (isCaught && rarityInfo.stars > 0) {
            const starsContainer = document.createElement('div');
            starsContainer.className = 'pokemon-card-stars';
            starsContainer.textContent = rarityInfo.icon;
            card.appendChild(starsContainer);
        }

        // Type icons
        if (pokemon.types && pokemon.types.length > 0) {
            const typesContainer = document.createElement('div');
            typesContainer.className = 'pokemon-card-types';

            pokemon.types.forEach(typeId => {
                const typeIcon = document.createElement('img');
                typeIcon.className = `pokemon-type-icon ${!isCaught ? 'uncaught' : ''}`;
                typeIcon.src = `type_icons_circular/${typeId}.png`;
                typeIcon.alt = `Type ${typeId}`;
                typesContainer.appendChild(typeIcon);
            });

            card.appendChild(typesContainer);
        }

        grid.appendChild(card);
    });
}

/**
 * Play Pokemon name audio using Phaser's audio system
 * @param {number} pokemonId - The Pokemon ID
 */
function playPokemonAudio(pokemonId) {
    if (gameInstance && gameInstance.sound) {
        const audioKey = `pokemon_audio_${pokemonId}`;
        gameInstance.sound.play(audioKey);
    }
}
