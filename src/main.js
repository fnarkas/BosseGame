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

if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
} else if (path === '/letters' || path === '/letters/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'letter-only';
    console.log('Running LETTER LISTENING mode (debug)');
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
} else if (path === '/store' || path === '/store/') {
    answerMode = 'letter'; // default
    startScene = 'MainGameScene';
    showStoreOnLoad = true;
    console.log('Opening STORE');
} else if (path === '/games' || path === '/games/') {
    showGamesMenu = true;
    console.log('Showing GAMES MENU');
} else {
    answerMode = 'letter'; // default
    console.log('Running in LETTER MATCH mode');
}

// Show games menu if /games route
if (showGamesMenu) {
    showGamesMenuPage();
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
                <a href="/lettermatch" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔤 Letter Match</a>
                <a href="/directions" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">⬅️➡️ Directions</a>
                <a href="/store" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🛒 Store</a>
            </div>
        </div>
    `;

    document.body.innerHTML = menuHTML;
}
