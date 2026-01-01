import Phaser from 'phaser';
import { POKEMON_DATA } from './pokemonData.js';
import { BootScene } from './scenes/BootScene.js';
import { MainGameScene } from './scenes/MainGameScene.js';
import { PokedexScene } from './scenes/PokedexScene.js';

// Make POKEMON_DATA globally available
window.POKEMON_DATA = POKEMON_DATA;

// Detect URL path to determine answer mode
const path = window.location.pathname;
let answerMode;

if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
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
    scene: [BootScene, MainGameScene, PokedexScene],
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
        }
    }
};

const game = new Phaser.Game(config);
