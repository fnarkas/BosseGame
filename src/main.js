import Phaser from 'phaser';
import { POKEMON_DATA } from './pokemonData.js';
import { BootScene } from './scenes/BootScene.js';
import { MainGameScene } from './scenes/MainGameScene.js';
import { PokedexScene } from './scenes/PokedexScene.js';
import { PokeballGameScene } from './scenes/PokeballGameScene.js';
import { initPokedex, showPokedex } from './pokedex.js';
import { initPokemonCaughtPopup, showPokemonCaughtPopup } from './pokemonCaughtPopup.js';
import { initStore, openStore } from './store.js';
import { migrateOldInventory } from './inventory.js';

// Make POKEMON_DATA globally available
window.POKEMON_DATA = POKEMON_DATA;

// Make showPokedex globally available for scenes
window.showPokedex = showPokedex;

// Make showPokemonCaughtPopup globally available for scenes
window.showPokemonCaughtPopup = showPokemonCaughtPopup;

// Make openStore globally available for scenes
window.openStore = openStore;

// Migrate old inventory before game starts
migrateOldInventory();

// Detect URL path to determine game mode and routing
const path = window.location.pathname;
let answerMode;
let startScene = 'MainGameScene';
let pokeballGameMode = null; // null = alternate, 'letter' = letter only, 'word-emoji' = word-emoji only
let showStoreOnLoad = false;
let showGamesMenu = false;
let showAdmin = false;

if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
} else if (path === '/letters' || path === '/letters/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'letter-only';
    console.log('Running LETTER LISTENING mode (debug)');
} else if (path === '/words' || path === '/words/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'word-emoji-only';
    console.log('Running WORD-EMOJI MATCH mode (debug)');
} else if (path === '/directions' || path === '/directions/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'directions-only';
    console.log('Running LEFT/RIGHT DIRECTIONS mode (debug)');
} else if (path === '/pokeballs' || path === '/pokeballs/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    console.log('Running POKEBALL GAME mode');
} else if (path === '/lettermatch' || path === '/lettermatch/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'lettermatch-only';
    console.log('Running LETTER DRAG MATCH mode (debug)');
} else if (path === '/speech' || path === '/speech/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'speech-only';
    console.log('Running SPEECH RECOGNITION mode (debug)');
} else if (path === '/numbers' || path === '/numbers/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'numbers-only';
    console.log('Running NUMBER LISTENING mode (debug)');
} else if (path === '/emojiword' || path === '/emojiword/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'emojiword-only';
    console.log('Running EMOJI-WORD MATCH mode (debug)');
} else if (path === '/wordspelling' || path === '/wordspelling/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'wordspelling-only';
    console.log('Running WORD SPELLING mode (debug)');
} else if (path === '/store' || path === '/store/') {
    answerMode = 'letter'; // default
    startScene = 'MainGameScene';
    showStoreOnLoad = true;
    console.log('Opening STORE');
} else if (path === '/games' || path === '/games/') {
    showGamesMenu = true;
    console.log('Showing GAMES MENU');
} else if (path === '/admin' || path === '/admin/') {
    showAdmin = true;
    console.log('Showing ADMIN PANEL');
} else if (path === '/reset' || path === '/reset/') {
    // Reset all progress
    resetAllProgress();
} else {
    answerMode = 'letter'; // default
    console.log('Running in LETTER MATCH mode');
}

// Show games menu if /games route
if (showGamesMenu) {
    showGamesMenuPage();
} else if (showAdmin) {
    showAdminPage();
} else {
    // Main game configuration
    const config = {
        type: Phaser.AUTO,
        width: 1024,
        height: 768,
        parent: 'game-container',
        backgroundColor: '#87CEEB',
        scene: [BootScene, MainGameScene, PokedexScene, PokeballGameScene],
        physics: {
            default: 'arcade',
            arcade: {
                debug: false
            }
        },
        callbacks: {
            preBoot: (game) => {
                // Set answer mode in registry before scenes start
                game.registry.set('answerMode', answerMode);
                game.registry.set('startScene', startScene);
                game.registry.set('pokeballGameMode', pokeballGameMode);
            }
        }
    };

    const game = new Phaser.Game(config);

    // Initialize Pokedex with game instance for audio access
    initPokedex(game);

    // Initialize Pokemon Caught Popup
    initPokemonCaughtPopup();

    // Initialize Store
    initStore();

    // Open store if /store route was accessed
    if (showStoreOnLoad) {
        openStore();
    }
}

function resetAllProgress() {
    // Clear all localStorage data
    localStorage.clear();

    console.log('All progress has been reset!');

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    const resetHTML = `
        <div style="font-family: Arial; max-width: 600px; margin: 80px auto; padding: 40px; text-align: center;">
            <h1 style="font-size: 80px; margin-bottom: 20px;">✅</h1>
            <h2 style="font-size: 36px; margin-bottom: 20px;">Progress Reset!</h2>
            <p style="font-size: 20px; color: #666; margin-bottom: 40px;">All Pokemon, pokeballs, and coins have been cleared.</p>
            <a href="/" style="display: inline-block; padding: 20px 40px; background: #4CAF50; color: white; border-radius: 10px; text-decoration: none; font-size: 24px;">Start Fresh</a>
        </div>
    `;

    document.body.innerHTML = resetHTML;
}

function showGamesMenuPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    const menuHTML = `
        <div style="font-family: Arial; max-width: 600px; margin: 80px auto; padding: 40px;">
            <h1 style="text-align: center; margin-bottom: 40px; font-size: 36px;">🎮 Games</h1>
            <div style="display: grid; gap: 15px;">
                <a href="/" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🎯 Main Game</a>
                <a href="/pokeballs" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🎲 Random Mix</a>
                <a href="/letters" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔊 Letter Listening</a>
                <a href="/words" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">📝 Word-Emoji Match</a>
                <a href="/emojiword" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">📖 Emoji-Word Match</a>
                <a href="/lettermatch" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔤 Letter Match</a>
                <a href="/directions" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">⬅️➡️ Directions</a>
                <a href="/speech" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🎤 Speech Reading</a>
                <a href="/numbers" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔢 Number Listening</a>
                <a href="/wordspelling" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">⌨️ Word Spelling</a>
                <a href="/store" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🛒 Store</a>
            </div>
        </div>
    `;

    document.body.innerHTML = menuHTML;
}

function showAdminPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    // Load current caught Pokemon
    const caughtPokemon = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');

    // Generate Pokemon grid
    const pokemonGrid = POKEMON_DATA.map(pokemon => {
        const isCaught = caughtPokemon.includes(pokemon.id);
        return `
            <div style="display: flex; align-items: center; padding: 10px; background: ${isCaught ? '#e8f5e9' : '#fff'}; border-radius: 8px; border: 1px solid ${isCaught ? '#4CAF50' : '#ddd'};">
                <input type="checkbox"
                       id="pokemon-${pokemon.id}"
                       ${isCaught ? 'checked' : ''}
                       onchange="togglePokemon(${pokemon.id})"
                       style="width: 20px; height: 20px; margin-right: 15px; cursor: pointer;">
                <img src="pokemon_images/${pokemon.filename}"
                     alt="${pokemon.name}"
                     style="width: 60px; height: 60px; margin-right: 15px; object-fit: contain;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 16px;">#${pokemon.id} ${pokemon.name}</div>
                    <div style="color: #666; font-size: 14px;">${isCaught ? '✓ Caught' : 'Not caught'}</div>
                </div>
            </div>
        `;
    }).join('');

    const adminHTML = `
        <div style="font-family: Arial; max-width: 1200px; margin: 40px auto; padding: 40px; height: calc(100vh - 80px); display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <h1 style="font-size: 36px; margin: 0;">⚙️ Admin Panel</h1>
                <a href="/" style="padding: 12px 24px; background: #2196F3; color: white; border-radius: 8px; text-decoration: none; font-size: 16px;">← Back to Game</a>
            </div>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 30px; flex-shrink: 0;">
                <h2 style="margin-top: 0;">Pokemon Manager</h2>
                <p style="color: #666;">Total caught: <strong id="caught-count">${caughtPokemon.length}</strong> / ${POKEMON_DATA.length}</p>
                <div style="display: flex; gap: 10px;">
                    <button onclick="catchAll()" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">✓ Catch All</button>
                    <button onclick="releaseAll()" style="padding: 12px 24px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">✗ Release All</button>
                </div>
            </div>

            <div style="flex: 1; overflow-y: auto; padding-right: 10px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 15px;">
                    ${pokemonGrid}
                </div>
            </div>
        </div>

        <script>
            function togglePokemon(id) {
                const caughtList = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
                const index = caughtList.indexOf(id);

                if (index > -1) {
                    caughtList.splice(index, 1);
                } else {
                    caughtList.push(id);
                }

                localStorage.setItem('pokemonCaughtList', JSON.stringify(caughtList));
                updateUI();
            }

            function catchAll() {
                const allIds = ${JSON.stringify(POKEMON_DATA.map(p => p.id))};
                localStorage.setItem('pokemonCaughtList', JSON.stringify(allIds));
                location.reload();
            }

            function releaseAll() {
                localStorage.setItem('pokemonCaughtList', JSON.stringify([]));
                location.reload();
            }

            function updateUI() {
                const caughtList = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
                document.getElementById('caught-count').textContent = caughtList.length;

                // Update checkbox backgrounds
                ${POKEMON_DATA.map(p => `
                    const elem${p.id} = document.getElementById('pokemon-${p.id}').parentElement;
                    if (caughtList.includes(${p.id})) {
                        elem${p.id}.style.background = '#e8f5e9';
                        elem${p.id}.style.borderColor = '#4CAF50';
                        elem${p.id}.querySelector('div div:last-child').textContent = '✓ Caught';
                    } else {
                        elem${p.id}.style.background = '#fff';
                        elem${p.id}.style.borderColor = '#ddd';
                        elem${p.id}.querySelector('div div:last-child').textContent = 'Not caught';
                    }
                `).join('')}
            }
        </script>
    `;

    document.body.innerHTML = adminHTML;
}
