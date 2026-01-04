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
} else if (path === '/store' || path === '/store/') {
    answerMode = 'letter'; // default
    startScene = 'MainGameScene';
    showStoreOnLoad = true;
    console.log('Opening STORE');
} else {
    answerMode = 'letter'; // default
    console.log('Running in LETTER MATCH mode');
}

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
