import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Loading emoji
        const loadingEmoji = this.add.text(width / 2, height / 2 - 80, '⚡', {
            font: '120px Arial'
        });
        loadingEmoji.setOrigin(0.5, 0.5);

        // Progress bar
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2, 320, 50);

        // Update progress bar
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 + 10, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingEmoji.destroy();
        });

        // Load all Pokemon images
        this.loadPokemonImages();
    }

    loadPokemonImages() {
        // Load all 100 Pokemon images using POKEMON_DATA
        POKEMON_DATA.forEach(pokemon => {
            this.load.image(`pokemon_${pokemon.id}`, `pokemon_images/${pokemon.filename}`);
        });
    }

    create() {
        // Store game data globally
        this.registry.set('caughtPokemon', this.loadCaughtPokemon());

        // Start main game
        this.scene.start('MainGameScene');
    }

    loadCaughtPokemon() {
        const saved = localStorage.getItem('pokemonCaughtList');
        return saved ? JSON.parse(saved) : [];
    }
}
