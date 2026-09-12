import { getAvailablePokemon } from './pokemonPool.js';
import { getRarityInfo } from './pokemonRarity.js';
import { getCaughtPokemonList, caughtIdSet } from './caughtPokemon.js';
import { playAudio, audioDuration, numberAudioKeys } from './audio.js';
import { pokemonAudioAsset } from './assetManifest.js';

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

    // Get available Pokemon (Gen 1 only)
    const availablePokemon = getAvailablePokemon();

    // Load caught Pokemon from localStorage
    const caughtPokemon = getCaughtPokemonList();
    // Handle both object format {id: 1, name: "...", caughtDate: "..."} and plain ID format [1, 2, 3]
    const caughtIds = caughtIdSet(caughtPokemon);

    // Update stats (count only available Pokemon that are caught)
    const availableIds = new Set(availablePokemon.map(p => p.id));
    const caughtCount = [...caughtIds].filter(id => availableIds.has(id)).length;
    statsDiv.textContent = `${caughtCount} / ${availablePokemon.length}`;

    // Clear existing grid
    grid.innerHTML = '';

    // Add placeholder for Pokemon #000
    const placeholderCard = document.createElement('div');
    placeholderCard.className = 'pokemon-card';
    const placeholderNumber = document.createElement('div');
    placeholderNumber.className = 'pokemon-card-number uncaught';
    placeholderNumber.textContent = '0';
    placeholderNumber.addEventListener('click', () => playNumberAudio(0));
    placeholderCard.appendChild(placeholderNumber);
    grid.appendChild(placeholderCard);

    // Generate Pokemon cards (Gen 1 only)
    availablePokemon.forEach((pokemon) => {
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

        // Pokemon number: the most prominent element (the child is learning
        // 1-151), shown for every card and spoken when tapped.
        const number = document.createElement('div');
        number.className = `pokemon-card-number ${!isCaught ? 'uncaught' : ''}`;
        number.textContent = String(pokemon.id);
        number.addEventListener('click', (event) => {
            event.stopPropagation();
            playNumberAudio(pokemon.id);
        });
        card.appendChild(number);

        // Pokemon image
        const img = document.createElement('img');
        img.className = `pokemon-card-image ${!isCaught ? 'uncaught' : ''}`;
        img.src = `pokemon_images/${pokemon.filename}`;
        img.alt = isCaught ? pokemon.name : '???';
        // Up to 1025 cards: only fetch the artwork that scrolls into view.
        img.loading = 'lazy';
        img.decoding = 'async';
        card.appendChild(img);

        // Pokemon name
        const name = document.createElement('div');
        name.className = `pokemon-card-name ${!isCaught ? 'uncaught' : ''}`;
        name.textContent = isCaught ? pokemon.name : '???';
        card.appendChild(name);

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
    // Pokemon names are loaded lazily per encounter, so the overlay plays the
    // file directly (it is an HTML overlay anyway), at the game's volume.
    const info = pokemonAudioAsset(pokemonId);
    if (!info) return;
    try {
        const el = new Audio(info.url);
        const manager = gameInstance && gameInstance.sound;
        el.volume = manager && Number.isFinite(manager.volume) ? manager.volume : 1;
        if (manager && manager.mute) return;
        el.play().catch(error => console.warn('Pokemon audio failed:', error));
    } catch (error) {
        console.warn('Pokemon audio failed:', error);
    }
}

// Say a number 0-999 by stitching the hundreds clip and the remainder
// ("hundra" + "femtioett"), with the 50 ms gap that reads as natural speech.
function playNumberAudio(n) {
    if (!gameInstance || !gameInstance.sound) return;
    const keys = numberAudioKeys(n);
    let delayMs = 0;
    keys.forEach(key => {
        const duration = audioDuration(gameInstance, key) * 1000;
        setTimeout(() => playAudio(gameInstance, key), delayMs);
        delayMs += duration + 50;
    });
}
