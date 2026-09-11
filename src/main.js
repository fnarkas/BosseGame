import Phaser from 'phaser';
import { POKEMON_DATA } from './pokemonData.js';
import { BootScene } from './scenes/BootScene.js';
import { MainGameScene } from './scenes/MainGameScene.js';
import { PokeballGameScene } from './scenes/PokeballGameScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import { initPokedex, showPokedex } from './pokedex.js';
import { initPokemonCaughtPopup, showPokemonCaughtPopup } from './pokemonCaughtPopup.js';
import { initStore, openStore } from './store.js';
import { migrateOldInventory } from './inventory.js';
import { loadActiveMinigame } from './minigameSession.js';
import { MINIGAMES } from './minigameRegistry.js';
import { showAdminPage } from './admin/index.js';
import { clearAllStorage } from './utils/clearStorage.js';

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

// Routes for the /games menu and the debug URLs. Every minigame comes from the
// registry; the last entry is the normal random mix.
const GAMES_REGISTRY = [
    ...MINIGAMES.map(game => ({ path: game.path, name: game.name, mode: game.forced, scene: 'PokeballGameScene' })),
    { path: '/pokeballs', name: '🎲 Random Mix', mode: null, scene: 'PokeballGameScene' }
];

// Detect URL path to determine game mode and routing
const path = window.location.pathname;
let answerMode;
let startScene = 'MainGameScene';
let pokeballGameMode = null;
let showStoreOnLoad = false;
let showGamesMenu = false;
let showAdmin = false;
let showReset = false;

// Check if path matches a game in the registry
const gameConfig = GAMES_REGISTRY.find(g => g.path === path || g.path + '/' === path);

if (gameConfig) {
    // Found a registered game
    answerMode = 'letter';
    startScene = gameConfig.scene;
    pokeballGameMode = gameConfig.mode;
    console.log(`Running ${gameConfig.name}`);
} else if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
} else if (path === '/store' || path === '/store/') {
    answerMode = 'letter';
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
    showReset = true;
} else {
    answerMode = 'letter';
    console.log('Running in LETTER MATCH mode');
}

// If a minigame was left unfinished, resume it on load instead of the main
// scene. This makes a reload return the player to the game they were in rather
// than letting them re-roll or back out. Explicit routes (a specific game,
// store, games menu, admin) take precedence and are left untouched.
if (startScene === 'MainGameScene' && !pokeballGameMode && !showStoreOnLoad && !showGamesMenu && !showAdmin) {
    if (loadActiveMinigame()) {
        startScene = 'PokeballGameScene';
        console.log('Resuming unfinished minigame');
    }
}

// Show games menu if /games route
if (showGamesMenu) {
    showGamesMenuPage();
} else if (showAdmin) {
    showAdminPage();
} else if (showReset) {
    // Only the reset page: never boot Phaser into the replaced DOM.
    resetAllProgress();
} else {
    // Main game configuration
    const config = {
        type: Phaser.AUTO,
        width: 1280,
        height: 900,
        parent: 'game-container',
        backgroundColor: '#87CEEB',
        // The game is designed at 1280x900. FIT scales the whole canvas down to
        // the viewport (iPad landscape is 1024-1180 px wide) so the HUD along
        // the edges is never clipped, and never scales above native size.
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            max: { width: 1280, height: 900 }
        },
        scene: [BootScene, MainGameScene, PokeballGameScene, SettingsScene],
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

    // Make game globally accessible for debug methods
    window.phaserGame = game;

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
    // Clear all saved data
    clearAllStorage();

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

    // Auto-generate game links from registry
    const gamesHTML = GAMES_REGISTRY.map(game => `
        <a href="${game.path}" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px; text-align: center;">
            ${game.name}
        </a>
    `).join('');

    const menuHTML = `
        <div style="font-family: Arial; max-width: 1200px; margin: 20px auto; padding: 20px;">
            <h1 style="text-align: center; margin-bottom: 40px; font-size: 36px;">🎮 Games</h1>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <a href="/" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px; text-align: center;">🎯 Main Game</a>
                ${gamesHTML}
                <a href="/store" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px; text-align: center;">🛒 Store</a>
            </div>
        </div>
    `;

    document.body.innerHTML = menuHTML;

    // Reset body style to allow scrolling
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
}
