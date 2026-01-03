import Phaser from 'phaser';
import { POKEMON_DATA } from './pokemonData.js';
import { BootScene } from './scenes/BootScene.js';
import { MainGameScene } from './scenes/MainGameScene.js';
import { PokedexScene } from './scenes/PokedexScene.js';
import { PokeballGameScene } from './scenes/PokeballGameScene.js';

// Make POKEMON_DATA globally available
window.POKEMON_DATA = POKEMON_DATA;

// Detect URL path to determine game mode and routing
const path = window.location.pathname;
let answerMode;
let startScene = 'MainGameScene';

if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
} else if (path === '/pokeballs' || path === '/pokeballs/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    console.log('Running POKEBALL GAME mode');
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
        }
    }
};

const game = new Phaser.Game(config);
