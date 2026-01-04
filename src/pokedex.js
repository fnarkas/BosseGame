import { POKEMON_DATA } from './pokemonData.js';

let gameInstance = null;

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
 */
export function showPokedex() {
    const overlay = document.getElementById('pokedex-overlay');
    overlay.style.display = 'block';

    // Render the Pokemon grid
    renderPokedexGrid();
}

/**
 * Hide the Pokedex overlay
 */
export function hidePokedex() {
    const overlay = document.getElementById('pokedex-overlay');
    overlay.style.display = 'none';
}

/**
 * Render the Pokemon grid with all 100 Pokemon
 */
function renderPokedexGrid() {
    const grid = document.getElementById('pokedex-grid');
    const statsDiv = document.getElementById('pokedex-stats');

    // Load caught Pokemon from localStorage
    const caughtPokemon = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
    const caughtIds = new Set(caughtPokemon.map(p => p.id));

    // Update stats
    statsDiv.textContent = `Fångade: ${caughtPokemon.length} / 100`;

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

    // Generate all 100 Pokemon cards
    POKEMON_DATA.forEach((pokemon) => {
        const isCaught = caughtIds.has(pokemon.id);

        // Create card element
        const card = document.createElement('div');
        card.className = `pokemon-card ${isCaught ? 'caught' : ''}`;

        // Add click handler for caught Pokemon to play audio
        if (isCaught) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                playPokemonAudio(pokemon.id);
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
